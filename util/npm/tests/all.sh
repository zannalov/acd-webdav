#!/bin/sh -e

# Redirect output to stderr.
exec 1>&2

util/npm/tests/non-ascii-filenames.sh
util/npm/tests/whitespace.sh
util/npm/tests/jshint.sh
