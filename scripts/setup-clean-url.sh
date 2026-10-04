#!/usr/bin/env bash
set -euo pipefail

# Keep the existing Firebase project and Supabase database.
project_id="heimfriseur-dayplayer100"
site_id="heimfriseur-app"

# Firebase checks global availability. Stop if creation fails.
npx --yes firebase-tools hosting:sites:create "$site_id" --project "$project_id"
npm run build
npx --yes firebase-tools deploy --only hosting --config firebase.clean.json --project "$project_id"
