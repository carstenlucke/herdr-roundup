#!/bin/sh
# The integrations' script is one of roundup-pane's files (mods/roundup-pane/integrations/), so every
# install has it and the logo menu runs it; this one, in a clone, runs that one. Either acts on the
# installed layout ($HERDR_APP_HOME, else ~/.config/herdr-app), whichever copy runs.
#
#   scripts/agent-integrations.sh install   <claude|codex|pi|opencode>
#   scripts/agent-integrations.sh uninstall <claude|codex|pi|opencode>
#   scripts/agent-integrations.sh status    [claude|codex|pi|opencode]
#   scripts/agent-integrations.sh where     [claude|codex|pi|opencode]
exec sh "$(dirname "$0")/../mods/roundup-pane/integrations/agent-integrations.sh" "$@"
