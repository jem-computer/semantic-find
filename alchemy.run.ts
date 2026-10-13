import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as State from 'alchemy/State'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import RouterWorker from './lib/RouterWorker'

export default Alchemy.Stack('HeatmapSearchExample', {
    providers: Cloudflare.providers(),
    state: State.localState()
}, Effect.gen(function* (){
    const worker = yield* RouterWorker

    return { url: worker.url }
}));