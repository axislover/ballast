import { BallastBootstrapper } from 'ballast-client';

let server = 'https://ballast.azurewebsites.net'
let bootstrapper = new BallastBootstrapper(document)
    .bootstrapAsync(server)
        .then(client => console.log('ballast loaded!'))
        .catch((error: Error) => console.log('error loading ballast: ' + error.message));