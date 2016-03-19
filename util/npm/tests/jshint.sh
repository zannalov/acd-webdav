#!/bin/sh -e
exec 1>&2
source util/npm/tests/get-compare-commit.sh

echo "Running jshint..."
git diff --cached --name-only --diff-filter=ACMR $against -- '**/*.js' \
    | while read -r f ; do git show ":$f" | jshint --filename "$f" - ; done
