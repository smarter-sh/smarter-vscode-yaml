---
name: smarter-api-testing
description: Use when the smarter-vscode-yaml extension must be tried against a real Smarter platform - to learn a cli api operation's real request and response before the extension uses it, to confirm a change to the api client, schema store or a platform command end to end, or to reproduce a user's bug. Explains the throwaway api key on the local platform, the probe script, curl for raw responses, trying the extension itself in an Extension Development Host, and cleaning up.
---

# Probing the Smarter Platform

The extension's api client is typed by the contract, but types don't prove
behavior. Before you call an operation for the first time, and after any change
to `src/core/api.ts`, `schemaStore.ts` or a command that calls the platform, run
it against the local platform: the one in `../smarter`, at
`http://localhost:9357`. If `curl -s -o /dev/null -w '%{http_code}' localhost:9357/`
doesn't answer 302, start it with `make run` in `../smarter` (the platform's
`smarter-docker-environment` skill).

**Never deploy.** `deploy` creates real, billable infrastructure, and the local
platform's containers hold live cloud credentials. Apply and delete only
throwaway resources that you created.

## 1. Create a throwaway key

```console
docker exec smarter-app bash -c 'cd /home/smarter_user/smarter && python manage.py shell -c "
from smarter.lib.drf.models import SmarterAuthToken
from smarter.apps.account.utils import smarter_cached_objects as s
from smarter.apps.account.models import UserProfile
u = s.smarter_admin
up = UserProfile.objects.filter(user=u).first()
_, key = SmarterAuthToken.objects.create(user=u, user_profile=up, name=\"vscode_probe\", description=\"DELETE ME\", is_active=True)
print(\"KEY=\" + key)
"' 2>/dev/null | grep '^KEY=' | cut -d= -f2 > "$SCRATCHPAD/key.txt"
```

Keep the key in your scratchpad, never in the repository, and never print it.
Don't use the key in the user's `~/.smarter/config.yaml`: it's theirs, and it
may be a production key.

## 2. Run the probe

```console
npm run compile-tests
SMARTER_API_KEY=$(cat "$SCRATCHPAD/key.txt") node skills/smarter-api-testing/scripts/probe-platform.js
SMARTER_API_KEY=$(cat "$SCRATCHPAD/key.txt") node skills/smarter-api-testing/scripts/probe-platform.js --write
```

[scripts/probe-platform.js](scripts/probe-platform.js) runs the compiled
`src/core` against the platform: whoami, the kinds, every live schema compared
with the bundled one, an example manifest, validate (valid and invalid, compared
with the local validator), and a bad key's 401. `--write` also applies,
describes, lists and deletes a throwaway Secret. Extend it when you add an api
method.

A live schema that differs from the bundled one means the contract needs a sync
(`smarter-vscode-contract`), or the local platform runs another version. Compare
JSON values, not text: the platform's key order differs from the committed
files'.

## 3. Raw responses, with curl

Every cli operation is a `POST`, even a read, and a manifest is sent as YAML
with its content type, exactly as the extension and the cli send it:

```console
KEY=$(cat "$SCRATCHPAD/key.txt")
curl -s -X POST -H "Authorization: Token $KEY" http://localhost:9357/api/v1/cli/whoami/
curl -s -X POST -H "Authorization: Token $KEY" "http://localhost:9357/api/v1/cli/describe/Secret/?name=<name>"
curl -s -X POST -H "Authorization: Token $KEY" -H "Content-Type: application/x-yaml" \
  --data-binary @manifest.yaml http://localhost:9357/api/v1/cli/validate/
```

`json-schema` and `example-manifest` are public: they need no key. Without the
`Content-Type`, Django parses the body as a form, and validate reports
`kind must be one of: ...` for a valid manifest.

## 4. The extension itself

To try a command or a provider by hand, press `F5` in this repository: VS Code
opens an Extension Development Host with the extension from `dist/`
(`.vscode/launch.json`). Set `smarterYaml.rootUrl` to `http://localhost:9357`
there, and the key with **Smarter: Set API Key**. Its log is in the Output
panel, under **Smarter**. You can't click through it yourself: describe to the
user what to try, or cover it with an integration test.

## 5. Clean up

```console
docker exec smarter-app bash -c 'cd /home/smarter_user/smarter && python manage.py shell -c "
from smarter.lib.drf.models import SmarterAuthToken
print(SmarterAuthToken.objects.filter(name=\"vscode_probe\", description=\"DELETE ME\").delete())
"' 2>/dev/null
rm -f "$SCRATCHPAD/key.txt"
```

Delete anything else you applied. If a probe finds a platform bug, report it in
your summary, with the request and the response.
