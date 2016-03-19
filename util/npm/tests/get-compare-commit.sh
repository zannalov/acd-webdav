#!/bin/sh -e
exec 1>&2

# Get base object for git
if test -z "$against"; then
    if git rev-parse --verify HEAD >/dev/null 2>&1; then
        against=HEAD
    else
        # Initial commit: diff against an empty tree object
        against=EMPTY
    fi
fi
if test "EMPTY" = "$against"; then
    against=4b825dc642cb6eb9a060e54bf8d69288fbee4904
fi
