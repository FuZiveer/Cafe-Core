#!/bin/sh
# Run from Git Bash IN the project root (right-click folder → "Open Git Bash here").
set -e
NOREPLY="257820268+FuZiveer@users.noreply.github.com"
OLD="tierput123@gmail.com"

git filter-branch -f --env-filter "
if test \"\$GIT_AUTHOR_EMAIL\" = \"$OLD\"; then
  export GIT_AUTHOR_NAME=\"FuZiveer\"
  export GIT_AUTHOR_EMAIL=\"$NOREPLY\"
fi
if test \"\$GIT_COMMITTER_EMAIL\" = \"$OLD\"; then
  export GIT_COMMITTER_NAME=\"FuZiveer\"
  export GIT_COMMITTER_EMAIL=\"$NOREPLY\"
fi
" -- --all

echo "--- Last 3 commits (should show noreply): ---"
git log -3 --format="%h %ae"

echo ""
echo "If emails look correct, run:"
echo "  git push --force origin main"
