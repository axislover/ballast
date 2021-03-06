using Ballast.Core.Messaging;
using Ballast.Core.Messaging.Events;
using Ballast.Core.Models;
using Ballast.Core.ValueObjects;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Ballast.Core.Services
{
    public class GameService : IGameService
    {

        private static int DEFAULT_BOARD_SIZE = 5;
        private static BoardType DEFAULT_BOARD_TYPE = BoardType.RegularPolygon;
        private static TileShape DEFAULT_TILE_SHAPE = TileShape.Hexagon;

        private readonly IEventBus _eventBus;
        private readonly IBoardGenerator _boardGenerator;
        private readonly IDictionary<Guid, Game> _games;
        private readonly Game _defaultGame;

        public GameService(IEventBus eventBus, IBoardGenerator boardGenerator)
        {
            _eventBus = eventBus;
            _boardGenerator = boardGenerator;
            _games = new Dictionary<Guid, Game>();
            _defaultGame = CreateDefaultGameAsync().GetAwaiter().GetResult();
            _eventBus.Subscribe<PlayerSignedOutEvent>(nameof(PlayerSignedOutEvent), OnPlayerSignedOutAsync);
        }

        private async Task<Game> CreateDefaultGameAsync()
        {
            var gameOptions = new CreateGameOptions()
            {
                BoardShapeValue = TileShape.Hexagon.Value,
                BoardTypeValue = BoardType.RegularPolygon.Value,
                BoardSize = 7,
                LandToWaterRatio = 0.333,
                VesselOptions = new CreateVesselOptions[]
                {
                    new CreateVesselOptions() { RequestedName = "U-571" },
                    new CreateVesselOptions() { RequestedName = "Red October" },
                    new CreateVesselOptions() { RequestedName = "The Nautilus" }
                }
            };
            var defaultGame = await CreateGameAsync(gameOptions);
            return defaultGame;
        }

        public void Dispose()
        {
            _eventBus.Unsubscribe<PlayerSignedOutEvent>(nameof(PlayerSignedOutEvent), OnPlayerSignedOutAsync);
            _games.Clear();
        }

        private async Task OnPlayerSignedOutAsync(PlayerSignedOutEvent evt)
        {
            var playerId = evt.Player.Id;
            var playerInGames = _games.Values.Where(x => x.Players.Any(y => y.Id.Equals(playerId)));
            foreach (var game in playerInGames)
            {
                var removePlayerOptions = new RemovePlayerOptions()
                {
                    PlayerId = playerId,
                    GameId = game.Id
                };
                await RemovePlayerFromGameAsync(removePlayerOptions);
            }
        }

        private async Task<Game> RetrieveGameByIdAsync(Guid gameId)
        {
            if (_games.ContainsKey(gameId))
                return await Task.FromResult(_games[gameId]);
            throw new KeyNotFoundException($"No game found for id {gameId}");
        }

        private async Task RemoveGameByIdAsync(Guid gameId)
        {
            var game = await RetrieveGameByIdAsync(gameId);
            _games.Remove(gameId);
        }

        private IEnumerable<VesselRole> GetDefaultVesselRolesForPlayer(Vessel vessel, Player player)
        {
            // TODO: Update this method to only place player into a single role
            // Create role list
            var roles = new List<VesselRole>();
            // Return all the vessel roles that are empty
            if ((vessel.Captain?.Id ?? Guid.Empty) == default(Guid))
                roles.Add(VesselRole.Captain);
            if ((vessel.Radioman?.Id ?? Guid.Empty) == default(Guid))
                roles.Add(VesselRole.Radioman);
            // Return the role list
            return roles;
        }

        public async Task<Guid> GetTestGameIdAsync() => await Task.FromResult(_defaultGame.Id);

        public async Task<IEnumerable<Game>> GetAllGamesAsync() => await Task.FromResult(_games.Values);

        public async Task<Game> GetGameAsync(Guid gameId) => await RetrieveGameByIdAsync(gameId);

        public async Task<Game> CreateGameAsync(CreateGameOptions options)
        {
            var gameId = Guid.NewGuid();
            var useBoardSize = options.BoardSize ?? DEFAULT_BOARD_SIZE;
            if (useBoardSize % 2 == 0)
                useBoardSize++;
            var useBoardType = (options.BoardTypeValue != null)
                ? BoardType.FromValue((int)options.BoardTypeValue)
                : DEFAULT_BOARD_TYPE;
            var useTileShape = (options.BoardShapeValue != null)
                ? TileShape.FromValue((int)options.BoardShapeValue)
                : DEFAULT_TILE_SHAPE;
            var useLandToWaterRatio = options.LandToWaterRatio;

            var board = _boardGenerator.CreateBoard(
                id: Guid.NewGuid(),
                boardType: useBoardType, // Default
                tileShape: useTileShape,
                columnsOrSideLength: useBoardSize,
                landToWaterRatio: useLandToWaterRatio
                );

            var players = new List<Player>();
            var vessels = CreateVessels(options.VesselOptions, board);
            var createdUtc = DateTime.UtcNow;
            var game = Game.FromProperties(id: gameId, board: board, vessels: vessels, players: players, createdUtc: createdUtc);
            _games[gameId] = game;
            await _eventBus.PublishAsync(GameStateChangedEvent.FromGame(game));
            return game;
        }

        public async Task<Game> StartGameAsync(Guid gameId)
        {
            var game = await RetrieveGameByIdAsync(gameId);
            game.Start();
            return game;
        }

        public async Task<Game> EndGameAsync(Guid gameId)
        {
            var game = await RetrieveGameByIdAsync(gameId);
            game.End();
            return await Task.FromResult(game);
        }

        public async Task DeleteGameAsync(Guid gameId) => await RemoveGameByIdAsync(gameId);

        public async Task<Game> AddPlayerToGameAsync(AddPlayerOptions options)
        {
            // Make sure no arguments left blank
            var gameId = options.GameId;
            if (gameId == default(Guid))
                throw new ArgumentNullException(nameof(options.GameId));
            var playerId = options?.PlayerId ?? Guid.Empty;
            if (playerId == default(Guid))
                throw new ArgumentNullException(nameof(options.PlayerId));
            // Locate game matching id from request
            var game = await RetrieveGameByIdAsync(gameId); // <-- Throws exception if game not found
            // Make sure the player doesn't already exist (by matching id)
            var playerExists = game.Players.Any(x => x.Id == playerId);
            if (playerExists)
                throw new ArgumentException($"Player with id {playerId} already belongs to the requested game ({gameId})");
            // Create the player and add to the game
            var player = Models.Player.FromProperties(playerId, options.PlayerName);
            game.AddPlayer(player);
            // If a vessel id was provided, we want to add the player onto the specified vessel as well
            var playerAddedToVesselRoleEvents = new List<PlayerAddedToVesselRoleEvent>();
            if (options.VesselId != null)
            {
                // Make sure the vessel exists
                var vessel = game.Vessels.FirstOrDefault(x => x.Id == options.VesselId);
                if (vessel == null)
                    throw new ArgumentException($"Vessel with id {options.VesselId} was not found in the requested game ({options.GameId})");
                // Build list of vessel roles to assign
                IEnumerable<VesselRole> vesselRoles = new List<VesselRole>();
                // If a vessel role list was provided, try to add the player into those roles (otherwise get default)
                if (options.VesselRoleValues.Any())
                    vesselRoles = options.VesselRoleValues.Select(x => Models.VesselRole.FromValue(x));
                else
                    vesselRoles = GetDefaultVesselRolesForPlayer(vessel, player);
                // Make sure we have at least one vessel role
                if (!vesselRoles.Any())
                    throw new ArgumentNullException(nameof(options.VesselRoleValues), "Can't add player to a vessel without specifying vessel role(s)");
                // Add into specified vessel role(s)
                foreach (var vesselRole in vesselRoles)
                {
                    // Set the role
                    game.SetVesselRole(vessel.Id, vesselRole, player);
                    // Store event to publish later
                    playerAddedToVesselRoleEvents.Add(
                        PlayerAddedToVesselRoleEvent.FromPlayerInGameVesselRole(
                            game,
                            vessel,
                            vesselRole,
                            player
                        )
                    );
                }
            }
            // Raise event for player added into game
            await _eventBus.PublishAsync(PlayerJoinedGameEvent.FromPlayerInGame(game, player));
            foreach (var playerAddedToVesselRoleEvent in playerAddedToVesselRoleEvents)
            {
                await _eventBus.PublishAsync(playerAddedToVesselRoleEvent);
            }
            // Return the updated game state
            return game;
        }

        public async Task<Game> RemovePlayerFromGameAsync(RemovePlayerOptions options)
        {
            // Make sure required arguments were provided
            var gameId = options?.GameId ?? Guid.Empty;
            if (gameId == default(Guid))
                throw new ArgumentNullException(nameof(options.GameId));
            var playerId = options?.PlayerId ?? Guid.Empty;
            if (playerId == default(Guid))
                throw new ArgumentNullException(nameof(options.PlayerId));
            // Get the game matching id from request 
            var game = await RetrieveGameByIdAsync(gameId); // <-- Throws exception if game not found
            // Get the player matching id from request 
            var player = game.Players.SingleOrDefault(x => x.Id.Equals(playerId));
            if (player == null)
                throw new ArgumentException($"Player with id {playerId} was not found in the requested game ({gameId})");
            // Make an event list for all of the vessel roles player is about to be removed from
            var playerRemovedFromVesselRoleEvents = new List<PlayerRemovedFromVesselRoleEvent>();
            foreach (var vessel in game.Vessels)
            {
                // player is the Captain
                if ((vessel.Captain?.Id ?? Guid.Empty).Equals(playerId))
                {
                    playerRemovedFromVesselRoleEvents.Add(
                        PlayerRemovedFromVesselRoleEvent.FromPlayerInGameVesselRole(
                            game,
                            vessel,
                            VesselRole.Captain,
                            player
                        )
                    );
                }
                // Player is the Radioman
                if ((vessel.Radioman?.Id ?? Guid.Empty).Equals(playerId))
                {
                    playerRemovedFromVesselRoleEvents.Add(
                        PlayerRemovedFromVesselRoleEvent.FromPlayerInGameVesselRole(
                            game,
                            vessel,
                            VesselRole.Radioman,
                            player
                        )
                    );
                }
            }
            // Remove the player from the game
            game.RemovePlayer(player);
            // Raise event for player removed from vessel role
            foreach (var playerRemovedFromVesselRoleEvent in playerRemovedFromVesselRoleEvents)
            {
                await _eventBus.PublishAsync(playerRemovedFromVesselRoleEvent);
            }
            // Raise event for player left game
            await _eventBus.PublishAsync(PlayerLeftGameEvent.FromPlayerInGame(game, player));
            // Return the updated game state
            return game;
        }

        public async Task<Vessel> AddPlayerToVesselAsync(AddPlayerOptions options)
        {
            // Make sure no arguments left blank
            var gameId = options.GameId;
            if (gameId == default(Guid))
                throw new ArgumentNullException(nameof(options.GameId));
            var playerId = options?.PlayerId ?? Guid.Empty;
            if (playerId == default(Guid))
                throw new ArgumentNullException(nameof(options.PlayerId));
            var vesselId = options.VesselId ?? Guid.Empty;
            if (vesselId == default(Guid))
                throw new ArgumentNullException(nameof(options.VesselId));
            // Locate game matching id from request
            var game = await RetrieveGameByIdAsync(options.GameId); // <-- Throws exception if game not found
            // Locate vessel matching id from request
            var vessel = game.Vessels.FirstOrDefault(x => x.Id.Equals(vesselId));
            // Make sure vessel was found
            if (vessel == null)
                throw new ArgumentException($"Vessel with id {options.VesselId} was not found in the requested game ({options.GameId})");
            // Get the player from existing list or create new
            PlayerJoinedGameEvent playerJoinedGameEvent = null;
            var player = game.Players.FirstOrDefault(x => x.Id == playerId);
            if (player != null)
            {
                // Make sure the player doesn't already exist on a vessel (by matching player id to all vessel roles)
                var playerAlreadyOnAVessel = game.Vessels.Any(x =>
                    playerId.Equals(x.Captain?.Id ?? default(Guid)) ||
                    playerId.Equals(x.Radioman?.Id ?? default(Guid))
                );
                if (playerAlreadyOnAVessel)
                    throw new ArgumentException($"Player with id {playerId} already belongs to a vessel in the requested game ({options.GameId})");
            }
            else
            {
                // Create the player
                player = Models.Player.FromProperties(playerId, options.PlayerName);
                // Add to the game
                game.AddPlayer(player);
                // Set flag to raise event at the end of the operation
                playerJoinedGameEvent = PlayerJoinedGameEvent.FromPlayerInGame(game, player);
            }
            // Build list of vessel roles to assign
            IEnumerable<VesselRole> vesselRoles = new List<VesselRole>();
            // If a vessel role list was provided, try to add the player into those roles (otherwise get default)
            if (options.VesselRoleValues.Any())
            {
                vesselRoles = options.VesselRoleValues.Select(x => Models.VesselRole.FromValue(x));
            }
            else
            {
                vesselRoles = GetDefaultVesselRolesForPlayer(vessel, player);
            }
            // Make sure we have at least one vessel role to assign
            if (!vesselRoles.Any())
                throw new ArgumentNullException(nameof(options.VesselRoleValues), "Can't add player to a vessel without specifying vessel role(s)");
            // If a vessel id was provided, we want to add the player onto the specified vessel
            var playerAddedToVesselRoleEvents = new List<PlayerAddedToVesselRoleEvent>();
            // Add into specified vessel role(s)
            foreach (var vesselRole in vesselRoles)
            {
                // Set the role
                game.SetVesselRole(vessel.Id, vesselRole, player);
                // Store event to publish later
                playerAddedToVesselRoleEvents.Add(
                    PlayerAddedToVesselRoleEvent.FromPlayerInGameVesselRole(
                        game,
                        vessel,
                        vesselRole,
                        player
                    )
                );
            }
            // Raise event for player added into game
            if (playerJoinedGameEvent != null)
            {
                await _eventBus.PublishAsync(playerJoinedGameEvent);
            }
            // Raise event(s) for player added into role(s)
            foreach (var playerAddedToVesselRoleEvent in playerAddedToVesselRoleEvents)
            {
                await _eventBus.PublishAsync(playerAddedToVesselRoleEvent);
            }
            // Return the new vessel state
            return vessel;
        }

        public async Task<Vessel> RemovePlayerFromVesselAsync(RemovePlayerOptions options)
        {
            // Make sure required arguments were provided
            var gameId = options?.GameId ?? Guid.Empty;
            if (gameId == default(Guid))
                throw new ArgumentNullException(nameof(options.GameId));
            var playerId = options?.PlayerId ?? Guid.Empty;
            if (playerId == default(Guid))
                throw new ArgumentNullException(nameof(options.PlayerId));
            var vesselId = options.VesselId ?? Guid.Empty;
            if (vesselId == default(Guid))
                throw new ArgumentNullException(nameof(options.VesselId));
            // Locate game matching id from request
            var game = await RetrieveGameByIdAsync(options.GameId); // <-- Throws exception if game not found
            // Locate vessel matching id from request
            var vessel = game.Vessels.FirstOrDefault(x => x.Id.Equals(vesselId));
            // Make sure vessel was found
            if (vessel == null)
                throw new ArgumentException($"Vessel with id {vesselId} was not found in the requested game ({gameId})");
            // Make sure player was found
            var player = game.Players.FirstOrDefault(x => x.Id == options.PlayerId);
            if (player == null)
                throw new ArgumentException($"Player with id {playerId} was not found in the requested game ({gameId})");
            // Make list of roles that player is being removed from
            var playerRemovedFromVesselRoleEvents = new List<PlayerRemovedFromVesselRoleEvent>();
            // Player is Captain
            if ((vessel.Captain?.Id ?? Guid.Empty).Equals(playerId))
            {
                // Remove from the role
                vessel.SetVesselRole(VesselRole.Captain, null);
                // Store the event
                playerRemovedFromVesselRoleEvents.Add(
                    PlayerRemovedFromVesselRoleEvent.FromPlayerInGameVesselRole(
                        game,
                        vessel,
                        VesselRole.Captain,
                        player
                    )
                );
            }
            // Player is Radioman
            if ((vessel.Radioman?.Id ?? Guid.Empty).Equals(playerId))
            {
                // Remove from the role
                vessel.SetVesselRole(VesselRole.Radioman, null);
                // Store the event
                playerRemovedFromVesselRoleEvents.Add(
                    PlayerRemovedFromVesselRoleEvent.FromPlayerInGameVesselRole(
                        game,
                        vessel,
                        VesselRole.Radioman,
                        player
                    )
                );
            }
            // Return the updated vessel state
            return vessel;
        }

        public async Task<Vessel> AddPlayerToVesselRoleAsync(AddPlayerOptions options)
        {
            // Make sure no arguments left blank
            var gameId = options.GameId;
            if (gameId == default(Guid))
                throw new ArgumentNullException(nameof(options.GameId));
            var playerId = options?.PlayerId ?? Guid.Empty;
            if (playerId == default(Guid))
                throw new ArgumentNullException(nameof(options.PlayerId));
            var vesselId = options.VesselId ?? Guid.Empty;
            if (vesselId == default(Guid))
                throw new ArgumentNullException(nameof(options.VesselId));
            var vesselRoles = options.VesselRoleValues.Select(x => Models.VesselRole.FromValue(x));
            if (!vesselRoles.Any())
                throw new ArgumentNullException(nameof(options.VesselRoleValues));
            // Locate game matching id from request
            var game = await RetrieveGameByIdAsync(options.GameId); // <-- Throws exception if game not found
            // Locate vessel matching id from request
            var vessel = game.Vessels.FirstOrDefault(x => x.Id.Equals(vesselId));
            // Make sure vessel was found
            if (vessel == null)
                throw new ArgumentException($"Vessel with id {vesselId} was not found in the requested game ({gameId})");
            // Get the player from existing list or create new
            PlayerJoinedGameEvent playerJoinedGameEvent = null;
            var player = game.Players.FirstOrDefault(x => x.Id == playerId);
            if (player != null)
            {
                // Make sure the player doesn't already exist in the vessel role (by matching player id
                var playerAlreadyOnADifferentVessel = game.Vessels.Any(x =>
                    !vesselId.Equals(x.Id) &&
                    playerId.Equals(x.Captain?.Id ?? default(Guid)) ||
                    playerId.Equals(x.Radioman?.Id ?? default(Guid))
                );
                if (playerAlreadyOnADifferentVessel)
                    throw new ArgumentException($"Player with id {playerId} already belongs to another vessel in the requested game ({gameId})");
            }
            else
            {
                // Create the player
                player = Models.Player.FromProperties(playerId, options.PlayerName);
                // Add to the game
                game.AddPlayer(player);
                // Set flag to raise event at the end of the operation
                playerJoinedGameEvent = PlayerJoinedGameEvent.FromPlayerInGame(game, player);
            }
            // Try to add player to each role in the list (if not already belonging to those roles)
            var playerAddedToVesselRoleEvents = new List<PlayerAddedToVesselRoleEvent>();
            foreach (var vesselRole in vesselRoles)
            {
                // Captain
                if (vesselRole.Value == VesselRole.Captain.Value)
                {
                    // Check the current Captain
                    var vesselCaptain = vessel.Captain;
                    if ((vesselCaptain?.Id ?? Guid.Empty).Equals(playerId))
                        throw new ArgumentException($"Player with id {playerId} already belongs to role ({VesselRole.Captain.Name})");
                    // Assign to role
                    vessel.SetVesselRole(VesselRole.Captain, player);
                    // Store the event
                    playerAddedToVesselRoleEvents.Add(
                        PlayerAddedToVesselRoleEvent.FromPlayerInGameVesselRole(
                            game,
                            vessel,
                            VesselRole.Captain,
                            player
                        )
                    );
                }
                // Radioman
                if (vesselRole.Value == VesselRole.Radioman.Value)
                {
                    // Check the current Radioman
                    var vesselRadioman = vessel.Radioman;
                    if ((vesselRadioman?.Id ?? Guid.Empty).Equals(playerId))
                        throw new ArgumentException($"Player with id {playerId} already belongs to role ({VesselRole.Radioman.Name})");
                    // Assign to role
                    vessel.SetVesselRole(VesselRole.Radioman, player);
                    // Store the event
                    playerAddedToVesselRoleEvents.Add(
                        PlayerAddedToVesselRoleEvent.FromPlayerInGameVesselRole(
                            game,
                            vessel,
                            VesselRole.Radioman,
                            player
                        )
                    );
                }
            }
            // Raise event for player added into game
            if (playerJoinedGameEvent != null)
            {
                await _eventBus.PublishAsync(playerJoinedGameEvent);
            }
            // Raise event(s) for player added into role(s)
            foreach (var playerAddedToVesselRoleEvent in playerAddedToVesselRoleEvents)
            {
                await _eventBus.PublishAsync(playerAddedToVesselRoleEvent);
            }
            // Return the new vessel state
            return vessel;
        }

        public async Task<Vessel> RemovePlayerFromVesselRoleAsync(RemovePlayerOptions options)
        {
            // Make sure required arguments were provided
            var gameId = options?.GameId ?? Guid.Empty;
            if (gameId == default(Guid))
                throw new ArgumentNullException(nameof(options.GameId));
            var playerId = options?.PlayerId ?? Guid.Empty;
            if (playerId == default(Guid))
                throw new ArgumentNullException(nameof(options.PlayerId));
            var vesselId = options.VesselId ?? Guid.Empty;
            if (vesselId == default(Guid))
                throw new ArgumentNullException(nameof(options.VesselId));
            var vesselRoles = options.VesselRoleValues.Select(x => Models.VesselRole.FromValue(x));
            if (!vesselRoles.Any())
                throw new ArgumentNullException(nameof(options.VesselRoleValues));
            // Locate game matching id from request
            var game = await RetrieveGameByIdAsync(options.GameId); // <-- Throws exception if game not found
            // Locate vessel matching id from request
            var vessel = game.Vessels.FirstOrDefault(x => x.Id.Equals(vesselId));
            // Make sure vessel was found
            if (vessel == null)
                throw new ArgumentException($"Vessel with id {vesselId} was not found in the requested game ({gameId})");
            // Make sure player was found
            var player = game.Players.FirstOrDefault(x => x.Id.Equals(playerId));
            if (player == null)
                throw new ArgumentException($"Player with id {playerId} was not found in the requested game ({gameId})");
            // Make sure player belongs to each role in the list
            var playerRemovedFromVesselRoleEvents = new List<PlayerRemovedFromVesselRoleEvent>();
            foreach (var vesselRole in vesselRoles)
            {
                // Captain
                if (vesselRole.Value == VesselRole.Captain.Value)
                {
                    // Check the current Captain
                    var vesselCaptain = vessel.Captain;
                    if (!(vesselCaptain?.Id ?? Guid.Empty).Equals(playerId))
                        throw new ArgumentException($"Player with id {playerId} was does not belong to role ({VesselRole.Captain.Name})");
                    // Remove from role
                    vessel.SetVesselRole(VesselRole.Captain, null);
                    // Store the event
                    playerRemovedFromVesselRoleEvents.Add(
                        PlayerRemovedFromVesselRoleEvent.FromPlayerInGameVesselRole(
                            game,
                            vessel,
                            VesselRole.Captain,
                            player
                        )
                    );
                }
                // Radioman
                if (vesselRole.Value == VesselRole.Radioman.Value)
                {
                    // Check the current Radioman
                    var vesselRadioman = vessel.Radioman;
                    if (!(vesselRadioman?.Id ?? Guid.Empty).Equals(playerId))
                        throw new ArgumentException($"Player with id {playerId} was does not belong to role ({VesselRole.Radioman.Name})");
                    // Remove from role
                    vessel.SetVesselRole(VesselRole.Captain, null);
                    // Store the event
                    playerRemovedFromVesselRoleEvents.Add(
                        PlayerRemovedFromVesselRoleEvent.FromPlayerInGameVesselRole(
                            game,
                            vessel,
                            VesselRole.Radioman,
                            player
                        )
                    );
                }
            }
            // Raise player removed from vessel role event(s)
            foreach (var playerRemovedFromVesselRoleEvent in playerRemovedFromVesselRoleEvents)
            {
                await _eventBus.PublishAsync(playerRemovedFromVesselRoleEvent);
            }
            // Return the updated vessel state
            return vessel;
        }

        public async Task<Vessel> MoveVesselAsync(VesselMoveRequest request)
        {
            // Locate game matching id from request
            var gameId = request.GameId;
            if (gameId == default(Guid))
                throw new ArgumentNullException(nameof(request.GameId));
            var game = await RetrieveGameByIdAsync(request.GameId);

            // Make sure we have a valid board
            var board = game?.Board != null ? game.Board : null;
            if (board == null)
                throw new KeyNotFoundException($"Game id '{gameId}' contains invalid board data!");

            // Locate vessel matching id from request
            var vesselId = request.VesselId;
            if (vesselId == default(Guid))
                throw new ArgumentNullException(nameof(request.VesselId));
            var foundVessel = game.Vessels.SingleOrDefault(x => x.Id == vesselId);
            if (foundVessel == null)
                throw new KeyNotFoundException($"Could not locate vessel with id '{vesselId}'");
            var vessel = foundVessel;

            // Derive current coordinates from request
            var requestStartCoordinates = CubicCoordinates.FromOrderedTriple(request.SourceOrderedTriple);
            var actualStartCoordinates = vessel.CubicCoordinates;

            // Make sure starting position matches current known position for vessel
            if (!requestStartCoordinates.Equals(actualStartCoordinates))
                throw new InvalidOperationException("Requested vessel movement(s) must originate from current vessel position");
            var requestStartTile = board.Tiles.SingleOrDefault(x => requestStartCoordinates.Equals(x.CubicCoordinates));

            // Determine if request specifies only cardinal directions or an actual set of tile coordinates
            CubicCoordinates targetCoordinates = null;
            var doubleIncrement = game.Board.TileShape.DoubleIncrement ?? false;
            var useCardinalDirections = !request.TargetOrderedTriple.Any();
            if (!useCardinalDirections)
            {
                // Get actual cubic coordinates
                var requestTargetCoordinates = CubicCoordinates.FromOrderedTriple(request.TargetOrderedTriple);
                // Verify that the target coordinates are one movement away from the current coordinates
                var totalUnitDistance = GetTotalUnitDistance(
                    doubleIncrement,
                    actualStartCoordinates,
                    requestTargetCoordinates
                );
                // Can't move multiple units and also must move at least 1 unit
                if (totalUnitDistance != 1)
                    throw new InvalidOperationException("Vessel movement must target a tile that is 1 unit away from current position");
                // Use target coordinates from request
                targetCoordinates = requestTargetCoordinates;
            }
            else
            {
                // Get directions/movements
                var north = request.Direction?.North ?? false;
                var south = request.Direction?.South ?? false;
                var west = request.Direction?.West ?? false;
                var east = request.Direction?.East ?? false;
                // Determine movement based on cardinal direction(s)
                bool hasMovement = north || south || west || east;
                // If no movement (must move at least 1 unit), throw error
                if (!hasMovement)
                    throw new InvalidOperationException("Vessel movement must target a tile that is 1 unit away from current position");
                // Make sure we don't have any offsetting movements
                if ((north && south) | (west && east))
                    throw new InvalidOperationException("Vessel movement may not specify opposite cardinal directions at the same time");
                // Calculate combined (diagonal) directions
                var northWest = north && west;
                var southWest = south && west;
                var northEast = north && east;
                var southEast = south && east;
                // After assigning diagonals, reduce "due-____" directions
                north = north && (!northWest && !northEast);
                south = south && (!southWest && !southEast);
                west = west && (!northWest && !southWest);
                east = east && (!northEast && !southEast);
                // Make sure the movement direction(s) are allowed by the current board/tile shape
                if (north && (!board?.TileShape?.HasDirectionNorth ?? false))
                    throw new InvalidOperationException("Current board/tile shape does not permit due North movement(s)");
                if (south && (!board?.TileShape?.HasDirectionSouth ?? false))
                    throw new InvalidOperationException("Current board/tile shape does not permit due South movement(s)");
                if (west && (!board?.TileShape?.HasDirectionWest ?? false))
                    throw new InvalidOperationException("Current board/tile shape does not permit due West movement(s)");
                if (east && (!board?.TileShape?.HasDirectionEast ?? false))
                    throw new InvalidOperationException("Current board/tile shape does not permit due East movement(s)");
                if (northWest && (!board?.TileShape?.HasDirectionNorthWest ?? false))
                    throw new InvalidOperationException("Current board/tile shape does not permit North-West movement(s)");
                if (southWest && (!board?.TileShape?.HasDirectionSouthWest ?? false))
                    throw new InvalidOperationException("Current board/tile shape does not permit South-West movement(s)");
                if (northEast && (!board?.TileShape?.HasDirectionNorthEast ?? false))
                    throw new InvalidOperationException("Current board/tile shape does not permit North-East movement(s)");
                if (southEast && (!board?.TileShape?.HasDirectionSouthEast ?? false))
                    throw new InvalidOperationException("Current board/tile shape does not permit South East movement(s)");
                // Get the adjacent tile
                Tile targetTile = null;
                if (north)
                    targetTile = GetNorthTile(board, requestStartCoordinates);
                else if (south)
                    targetTile = GetSouthTile(board, requestStartCoordinates);
                else if (west)
                    targetTile = GetWestTile(board, requestStartCoordinates);
                else if (east)
                    targetTile = GetEastTile(board, requestStartCoordinates);
                else if (northWest)
                    targetTile = GetNorthWestTile(board, requestStartCoordinates);
                else if (southWest)
                    targetTile = GetSouthWestTile(board, requestStartCoordinates);
                else if (northEast)
                    targetTile = GetNorthEastTile(board, requestStartCoordinates);
                else if (southEast)
                    targetTile = GetSouthEastTile(board, requestStartCoordinates);
                // Make sure we obtained a valid tile, otherwise keep the vessel where it already is 
                if (targetTile == null)
                    targetTile = requestStartTile;
                // Get new coordinates
                targetCoordinates = targetTile.CubicCoordinates;
            }

            // Move the vessel to the new coordinates
            game.UpdateVesselCoordinates(vesselId, targetCoordinates);
            vessel = game.Vessels.FirstOrDefault(x => x.Id.Equals(vesselId));
            await _eventBus.PublishAsync(VesselStateChangedEvent.FromVesselInGame(game, vessel));

            // Finished changing game state
            await _eventBus.PublishAsync(GameStateChangedEvent.FromGame(game));

            // Return the new vessel state
            return vessel;

        }

        private IEnumerable<Vessel> CreateVessels(IEnumerable<CreateVesselOptions> createVesselOptions, Board board)
        {
            var vessels = new List<Vessel>();
            foreach (var vesselOptions in createVesselOptions)
            {
                var vesselId = Guid.NewGuid();
                var vesselName = vesselOptions.RequestedName;
                var startingCoordinates = vesselOptions.StartOrderedTriple != null
                    ? CubicCoordinates.FromOrderedTriple(vesselOptions.StartOrderedTriple)
                    : board.GetRandomPassableCoordinates();
                var vessel = Vessel.FromProperties(
                    id: vesselId,
                    name: vesselName,
                    cubicCoordinates: startingCoordinates,
                    captain: null,
                    radioman: null
                );
                vessels.Add(vessel);
            }
            return vessels;
        }

        private int GetTotalUnitDistance(bool doubleIncrement, CubicCoordinates fromTileCoordinates, CubicCoordinates toTileCoordinates)
        {
            var x1 = fromTileCoordinates.X;
            var y1 = fromTileCoordinates.Y;
            var z1 = fromTileCoordinates.Z;
            var x2 = toTileCoordinates.X;
            var y2 = toTileCoordinates.Y;
            var z2 = toTileCoordinates.Z;
            var distance = Math.Max(Math.Max(x2 - x1, y2 - y1), z2 - z1);
            if (doubleIncrement)
                return Convert.ToInt32(distance / 2);
            return distance;
        }

        private Tile GetNorthTile(Board board, CubicCoordinates fromTileCoordinates)
        {
            var doubleIncrement = board.TileShape.DoubleIncrement ?? false;
            if (!doubleIncrement)
                throw new Exception("Grid coordinate system does not support movement north without double-incrementation");
            var newCoordinates = fromTileCoordinates
                .AddXSubtractZ(1)
                .AddYSubtractZ(1);
            var getTile = board.GetTileFromCoordinates(newCoordinates);
            if (getTile == null)
                throw new Exception("No tile exists for the requested position/cordinates");
            return getTile;
        }

        private Tile GetSouthTile(Board board, CubicCoordinates fromTileCoordinates)
        {
            var doubleIncrement = board.TileShape.DoubleIncrement ?? false;
            if (!doubleIncrement)
                throw new Exception("Grid coordinate system does not support movement south without double-incrementation");
            var newCoordinates = fromTileCoordinates
                .AddZSubtractX(1)
                .AddZSubtractY(1);
            var getTile = board.GetTileFromCoordinates(newCoordinates);
            if (getTile == null)
                throw new Exception("No tile exists for the requested position/cordinates");
            return getTile;
        }

        private Tile GetWestTile(Board board, CubicCoordinates fromTileCoordinates)
        {
            var doubleIncrement = board.TileShape.DoubleIncrement ?? false;
            CubicCoordinates newCoordinates = fromTileCoordinates
                .AddYSubtractX(doubleIncrement ? 2 : 1);
            var getTile = board.GetTileFromCoordinates(newCoordinates);
            if (getTile == null)
                throw new Exception("No tile exists for the requested position/cordinates");
            return getTile;
        }

        private Tile GetEastTile(Board board, CubicCoordinates fromTileCoordinates)
        {
            var doubleIncrement = board.TileShape.DoubleIncrement ?? false;
            CubicCoordinates newCoordinates = fromTileCoordinates
                .AddXSubtractY(doubleIncrement ? 2 : 1);
            var getTile = board.GetTileFromCoordinates(newCoordinates);
            if (getTile == null)
                throw new Exception("No tile exists for the requested position/cordinates");
            return getTile;
        }

        private Tile GetNorthWestTile(Board board, CubicCoordinates fromTileCoordinates)
        {
            var doubleIncrement = board.TileShape.DoubleIncrement ?? false;
            CubicCoordinates newCoordinates = fromTileCoordinates
                .AddYSubtractZ(doubleIncrement ? 2 : 1);
            if (doubleIncrement)
                newCoordinates = newCoordinates.AddYSubtractX(1);
            var getTile = board.GetTileFromCoordinates(newCoordinates);
            if (getTile == null)
                throw new Exception("No tile exists for the requested position/cordinates");
            return getTile;
        }


        private Tile GetSouthWestTile(Board board, CubicCoordinates fromTileCoordinates)
        {
            var doubleIncrement = board.TileShape.DoubleIncrement ?? false;
            CubicCoordinates newCoordinates = fromTileCoordinates
                .AddZSubtractX(doubleIncrement ? 2 : 1);
            if (doubleIncrement)
                newCoordinates = newCoordinates.AddYSubtractX(1);
            var getTile = board.GetTileFromCoordinates(newCoordinates);
            if (getTile == null)
                throw new Exception("No tile exists for the requested position/cordinates");
            return getTile;
        }

        private Tile GetNorthEastTile(Board board, CubicCoordinates fromTileCoordinates)
        {
            var doubleIncrement = board.TileShape.DoubleIncrement ?? false;
            CubicCoordinates newCoordinates = fromTileCoordinates
                .AddXSubtractZ(doubleIncrement ? 2 : 1);
            if (doubleIncrement)
                newCoordinates = newCoordinates.AddXSubtractY(1);
            var getTile = board.GetTileFromCoordinates(newCoordinates);
            if (getTile == null)
                throw new Exception("No tile exists for the requested position/cordinates");
            return getTile;
        }

        private Tile GetSouthEastTile(Board board, CubicCoordinates fromTileCoordinates)
        {
            var doubleIncrement = board.TileShape.DoubleIncrement ?? false;
            CubicCoordinates newCoordinates = fromTileCoordinates
                .AddZSubtractY(doubleIncrement ? 2 : 1);
            if (doubleIncrement)
                newCoordinates = newCoordinates.AddXSubtractY(1);
            var getTile = board.GetTileFromCoordinates(newCoordinates);
            if (getTile == null)
                throw new Exception("No tile exists for the requested position/cordinates");
            return getTile;
        }

    }
}