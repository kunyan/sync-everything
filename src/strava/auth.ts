import { createServer } from "node:http";
import { exec } from "node:child_process";
import { platform } from "node:os";
import type { AuthorizeOptions, AuthResult, AuthTokenResponse } from "./types.js";

const STRAVA_OAUTH_URL = "https://www.strava.com/oauth/token";
const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";

export async function exchangeCodeForTokens(params: {
  clientId: string;
  clientSecret: string;
  code: string;
}): Promise<AuthResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
  });

  const response = await fetch(STRAVA_OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Token exchange failed (${response.status}): ${text}`
    );
  }

  const data: AuthTokenResponse = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athlete: {
      id: data.athlete.id,
      firstname: data.athlete.firstname,
      lastname: data.athlete.lastname,
    },
  };
}

function openUrl(url: string): void {
  const os = platform();
  const cmd =
    os === "darwin" ? "open" : os === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${url}"`);
}

export async function authorizeStrava(
  options: AuthorizeOptions & {
    openBrowser?: boolean;
    _onServerReady?: (port: number) => void;
  }
): Promise<AuthResult> {
  const port = options.port ?? 8080;
  const scopes = options.scopes ?? ["activity:read_all", "activity:write"];
  const shouldOpenBrowser = options.openBrowser ?? true;

  return new Promise<AuthResult>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h1>Authorization denied.</h1></body></html>");
        server.close();
        reject(new Error(`Authorization failed: ${error}`));
        return;
      }

      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        res.end("Missing code parameter");
        return;
      }

      try {
        const result = await exchangeCodeForTokens({
          clientId: options.clientId,
          clientSecret: options.clientSecret,
          code,
        });

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Authorization successful!</h1><p>You can close this window.</p></body></html>"
        );
        server.close();
        resolve(result);
      } catch (err) {
        res.writeHead(500);
        res.end("Token exchange failed");
        server.close();
        reject(err);
      }
    });

    server.listen(port, () => {
      const actualPort = (server.address() as { port: number }).port;
      const redirectUri = `http://localhost:${actualPort}/callback`;
      const authorizeUrl = `${STRAVA_AUTHORIZE_URL}?client_id=${options.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopes.join(",")}`;

      if (shouldOpenBrowser) {
        console.log(`Opening browser for Strava authorization...`);
        console.log(`If the browser doesn't open, visit: ${authorizeUrl}`);
        openUrl(authorizeUrl);
      }

      options._onServerReady?.(actualPort);
    });
  });
}
