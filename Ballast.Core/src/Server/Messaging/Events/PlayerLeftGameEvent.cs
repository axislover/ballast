using Ballast.Core.Models;
using System;
using System.Linq;

namespace Ballast.Core.Messaging.Events
{

    public class PlayerLeftGameEventState : EventStateBase
    {
        public Game Game { get; set; }
        public Player Player { get; set; }
    }

    public class PlayerLeftGameEvent : EventBase 
    {

        public override string Id => nameof(PlayerLeftGameEvent);

        public Game Game { get; private set; }
        public Player Player { get; set;}

        private PlayerLeftGameEvent(Game game, Player player, string isoDateTime = null) : base(isoDateTime) 
        {
            Game = game;
            Player = player;
        }

        public static implicit operator PlayerLeftGameEvent(PlayerLeftGameEventState state) =>
            new PlayerLeftGameEvent(state.Game, state.Player, state.IsoDateTime);
            
        public static PlayerLeftGameEvent FromPlayerInGame(Game game, Player player) =>
            new PlayerLeftGameEvent(game, player);

    }

}