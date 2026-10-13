// The site Worker in front of the Foldkit app. Cloudflare serves the built
// app as static assets; only /api/* runs this Worker (see alchemy.run.ts),
// which hands it to the API Worker over a service binding.

type Fetcher = { fetch(request: Request): Promise<Response> }

type Env = {
  API: Fetcher
  ASSETS: Fetcher
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    return pathname.startsWith('/api/')
      ? env.API.fetch(request)
      : env.ASSETS.fetch(request)
  },
}
