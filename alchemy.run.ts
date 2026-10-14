import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import RouterWorker from './lib/RouterWorker'

export default Alchemy.Stack('HeatmapSearchExample', {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
}, Effect.gen(function* (){
    const api = yield* RouterWorker

    const site = yield* Cloudflare.Website.Foldkit('Website', {
        rootDir: 'web',
        main: 'worker/worker.ts',
        env: { API: api },
        assets: { runWorkerFirst: ['/api/*'] },
    })

    return { url: site.url }
}));
