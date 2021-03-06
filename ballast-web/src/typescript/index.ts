import { BallastBootstrapper } from 'ballast-client';

let server = window.location.origin;
let bootstrapper = new BallastBootstrapper(document)
    .bootstrapAsync(server)
        .then(client => console.log('ballast loaded!'))
        .catch((error: Error) => console.log('error loading ballast: ' + error.message));