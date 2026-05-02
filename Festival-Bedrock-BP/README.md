Festival Bedrock Add-on
=======================

This package is a Bedrock add-on rewrite of the PocketMine `Festival` plugin.
It provides area definition, enter/leave detection, block protection, and command-based management.

## Installation
1. Copy the `Festival-Bedrock-addon` folder into your Bedrock world `development_behavior_packs` or `behavior_packs` folder.
2. Enable `experimental_gameplay` for the world.
3. Start the server and verify scripting is enabled.

## Features
- `/festival pos1` and `/festival pos2` to select area corners.
- `/festival create <name>` to create a cube area.
- `/festival create-sphere <name> <radius>` to create a spherical area.
- `/festival list` to show defined areas.
- `/festival info <name>` to inspect area settings.
- `/festival delete <name>` to remove an area.
- `/festival flag <area> <flag> <on|off>` to toggle protection flags.
- `/festival whitelist <add|remove> <area> <player>` to manage access.
- `/festival command <area> add <enter|leave|center> <id> <cmd>` to attach area event commands.
- Area enter/leave/center detection for players.
- Block place/break protection inside areas with the `edit` flag enabled.
- Basic hurt/pvp protection inside configured areas.

## Notes
- Area state is saved to `festival_data.json` when file persistence is available.
- The Bedrock scripting runtime must support the event names used in `scripts/main.js`.
- This is a rewrite, not a complete feature-for-feature port of the original plugin.

## Next improvements
- Add item-based area selection.
- Add floating text or particle area labels.
- Add better operator/permission handling.
- Add config file support and translation resources.
