# Drzewo to Drzewo – Park Południowy

A two-player hide-and-seek game with trees, played with our husky Aura in
Park Południowy, Wrocław. Runs serverless on AWS, built with Terraform,
same setup as [Our Trips](../photo_gallery).

## The game

- **Hide a tree 🐺**: take a photo of Aura in front of a tree and confirm which
  tree it is on the map. The other player gets **only the photo**.
- **Find it 📸**: go to the park, find the tree, take the same photo of Aura there
  and say which tree you're at. A wrong guess tells you how far off you are
  ("97 m – cool"). Stuck? Buy a hint: species, a 40 m circle on the map, or the
  number on the tree's plate. Or give up.
- **Hunt 🗺️**: a tree is **done** only when it's found as the other
  player's hidden tree (the right guess). Hiding a tree or a wrong guess marks
  nothing, and there's no way to mark a tree yourself. The map shows all 3,046
  trees of the park: **grey** = not done yet, **green** = done. Filter by player.
- **Trees 🌳**: every kind of tree in the park ("Lipa 662, Klon 562, Dąb 323…")
  with how many are done, the species inside each kind, and "show on the map".
  A second view lists the trees completed in the game.
- **Scores 🏆**: points per player, latest photos.

| Points | |
| --- | --- |
| +10 | for finding a hidden tree, −2 per wrong guess, −3 per hint (at least 3) |
| +5 | for the hider, when the other player gives up |

**No cheating by accident:** the photo is resized in the browser before upload,
which removes all EXIF data, so the GPS position of the hidden tree is not in the
file. The API never sends the hidden tree to the seeker while it's open, and the
hider's photo doesn't turn that tree green on the seeker's map.

**Which tree am I at?** When you take a photo, the app reads its GPS (or the
phone's current location), zooms the map in, and suggests the closest trees.
GPS under trees is ±5–15 m and trees are dense, so check the suggestion: tap the
right dot, compare species and trunk size, or type the number from the metal
plate on the trunk (most trees have one).

## Tree data

[`data/trees.json`](data/trees.json) comes from the city's tree inventory
(Zarząd Zieleni Miejskiej, published on the
[Wrocław geoportal](https://geoportal.wroclaw.pl/mapy/zzm/) as the
`zzm_sip_drzewa_wms_wfs` service): 3,046 living trees tagged
"Park Południowy", with species (Polish + Latin), trunk circumference, plate
number and a link to the city's photo. The park outline comes from
OpenStreetMap (which has only 4 trees mapped there, so it's not used for trees).
Licence terms of the ZZM layer aren't stated on the service; we use it for a
private, non-commercial game.

Refresh it any time (standard library only) and commit the diff:

```bash
make trees
```

## Architecture

```
Phone browser
   │  https://park.pusiaczkowo.pl   (the xxxx.cloudfront.net address works too)
   ▼
CloudFront ─┬─ /*      → S3 "web" bucket (React app, private via OAC)
            └─ /api/*  → API Gateway (HTTP API, Cognito JWT) → Lambda "api" → DynamoDB
                                                                  │         (finds, challenges)
login.pusiaczkowo.pl ◄── React app (Authorization Code + PKCE)  │ presigned URLs
(shared Cognito pool)
                                                                  ▼
                         S3 "photos" bucket ◄── browser uploads photo + thumbnail
                                                (resized in the browser, EXIF/GPS removed)
```

Unlike Our Trips there is no image-processing Lambda: the browser does the
resizing. Map: Leaflet + OpenStreetMap tiles; the 3,000 trees are drawn on a
canvas so it stays smooth on a phone.

```
data/                 trees.json + park.json (from tools/import_trees.py)
tools/
  import_trees.py     downloads the trees from the city + park outline from OSM
  dev_server.py       local fake backend (real handler + in-memory AWS via moto)
app/backend/api/      API Lambda: handler.py (routes), game.py (rules, scoring)
app/backend/tests/    pytest (moto)
app/frontend/         React + Vite + TypeScript, Leaflet
terraform/
  bootstrap/          one-time: state bucket + GitHub OIDC roles (local state)
  modules/            auth, storage, api, cdn, monitoring
  envs/prod/          wires the modules; writes /config.json for the app
.github/workflows/    ci.yml (PR checks + plan comment), deploy.yml (main → prod)
```

## Try it locally (no AWS)

```bash
make fe-install
make local
```

Open http://localhost:5173 and pick a player; no passwords. The real API code
runs against an in-memory database; everything is gone when you stop it. Open a
second browser window to play as the other person. On your phone (same Wi-Fi),
open `http://<your-mac-ip>:5173`, though GPS needs HTTPS on most
phones, so test that on the deployed site.

## First deployment

Prerequisites: AWS CLI logged in, Terraform ≥ 1.10, Node 22, Python 3.

```bash
# 1. One-time bootstrap: state bucket + GitHub roles (keep its local tfstate safe).
#    Reuses the GitHub OIDC provider that already exists in the account.
make bootstrap

# 2. Point the main stack at the state bucket from the bootstrap output
export TF_STATE_BUCKET=park-game-tfstate-<account-id>
make tf-init

# 3. Alert e-mail. (Players are the users of the shared login, see "Login".)
cp terraform/envs/prod/terraform.tfvars.example terraform/envs/prod/terraform.tfvars
#    …edit the alert e-mail…

# 4. Infra + frontend
make fe-install
make deploy
```

Then confirm the **SNS** e-mail (click it, or alerts aren't sent). Open the
`site_url` output on your phones, log in with your pusiaczkowo.pl login, and add
it to the home screen.

### CI/CD (GitHub Actions)

Same as Our Trips: PRs get tests, a frontend build and a `terraform plan`
comment; pushes to `main` deploy. Repo settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `AWS_PLAN_ROLE_ARN` | bootstrap output `plan_role_arn` |
| Variable | `AWS_APPLY_ROLE_ARN` | bootstrap output `apply_role_arn` |
| Variable | `TF_STATE_BUCKET` | bootstrap output `state_bucket` |
| Secret | `TF_VAR_ALERT_EMAIL` | `you@example.com` |

Plus an environment named **`prod`** (Settings → Environments).

## Domain: park.pusiaczkowo.pl

The game runs on **https://park.pusiaczkowo.pl**. The `pusiaczkowo.pl` DNS
zone and the wildcard certificate (`*.pusiaczkowo.pl`) are shared with the
main page and Our Trips, and managed in the root `terraform/` of
[jablon1989/aura-the-husky](https://github.com/jablon1989/aura-the-husky).
**Apply that stack first.**

This stack finds the zone and the certificate by name
([terraform/envs/prod/domain.tf](terraform/envs/prod/domain.tf)), then adds
the hostname to CloudFront, creates the DNS record, and allows logins from both
the new address and the old `*.cloudfront.net` one. The defaults live in
`terraform/envs/prod/variables.tf` (`domain_name`, `domain_zone`), so CI needs
no extra settings. Set `domain_name = null` to go back to CloudFront only.

## E-mail notifications

The other player gets an e-mail with Aura's photo and a link when you **hide a
tree**. The hider gets one when their tree is **found** (with the points) or
when the other player **gives up**. Wrong guesses and hints send nothing.

- Sent by the API Lambda through Amazon SES from `game@pusiaczkowo.pl`
  ([notify.py](app/backend/api/notify.py)). The domain is verified (DKIM, SPF,
  DMARC) in the shared stack of `aura-the-husky`, so apply that first.
- The SES account is in the **sandbox**: it only delivers to confirmed
  addresses. The shared stack confirms every login user: each gets one
  "Amazon Web Services – Email Address Verification Request" e-mail. Click the
  link once.
- A failed e-mail is only logged (CloudWatch), never an error in the game.
- Locally (`make local`) e-mails are printed in the fake backend's log.
- Switch off: `notify_from = null` in `terraform.tfvars`.

## Login and players

One login for all apps on pusiaczkowo.pl: the user pool, its users and the
login page **https://login.pusiaczkowo.pl** live in the shared stack of
[jablon1989/aura-the-husky](https://github.com/jablon1989/aura-the-husky)
(`terraform/login.tf`, users in its gitignored `users.auto.tfvars`). This repo
only has its own app client ([terraform/modules/auth](terraform/modules/auth)),
found by the pool's name `aurathehusky-users`.

**Players** are that pool's users. The API reads names and e-mails from Cognito
([players.py](app/backend/api/players.py), cached for 5 minutes), so adding
someone there makes them a player here, with no change in this repo.

**Renaming a player** (the name shown in the game, the `name` attribute): in
the shared stack, change the key in `users.auto.tfvars` and add a `moved` block
so the user is renamed rather than recreated, for example:

```hcl
moved {
  from = aws_cognito_user.this["Wife"]
  to   = aws_cognito_user.this["Asiulka"]
}
```

Game history is stored under the name, so entries from before a rename keep the old one.

The game's old, separate user pool `park-game-prod-users` is no longer managed
by Terraform ([migration.tf](terraform/envs/prod/migration.tf)). Once the new
login works, delete it:

```bash
aws cognito-idp update-user-pool --user-pool-id <old pool id> --deletion-protection INACTIVE
aws cognito-idp delete-user-pool-domain --user-pool-id <old pool id> --domain park-game-prod-<account id>
aws cognito-idp delete-user-pool --user-pool-id <old pool id>
```

## Costs

Two players, serverless: Cognito, Lambda, API Gateway, DynamoDB and CloudFront
stay in the free tier or close to it. Photos are ~0.5 MB each, so even
thousands cost cents per month. The `monitoring` module e-mails you at 80% of a
$5 monthly budget. OpenStreetMap tiles are free for light personal use (their
[tile policy](https://operations.osmfoundation.org/policies/tiles/)).

## Ideas for later

- Push notification / e-mail when the other player hides a tree
- Seasonal challenges ("find 10 oaks", "a tree with a trunk over 3 m")
- Species collection page (how many of the park's 129 species you've found)
- "Hot/cold" live mode: distance to the last guess while you walk
