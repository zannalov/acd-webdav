#!/bin/sh -e
exec 1>&2
source util/npm/tests/get-compare-commit.sh

echo "Checking for whitespace errors..."
GIT_PAGER=cat git diff-index --check --cached $against --
