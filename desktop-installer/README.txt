NullCord for Windows
====================

Install
-------

Run NullCord-Setup-1.1.0.exe and follow the installer. It creates Start Menu
and Desktop shortcuts. The installer is per-user by default, so it does not
require administrator access.

Automatic updates
-----------------

NullCord checks GitHub for a new desktop build shortly after launch and every
six hours. Updates download in the background. When one is ready, you can
restart immediately or let it install when you close NullCord.

The app loads https://nullcord.canyonlakelabs.com, so web updates are picked
up immediately without replacing the desktop app. Only desktop-shell updates
require the updater.

Unsigned build
--------------

This build is not code-signed. Windows SmartScreen may ask you to choose
"More info" -> "Run anyway".

Keyboard shortcuts
------------------

  F5 or Ctrl+R  reload
  F11           fullscreen

Calls use peer-to-peer WebRTC with STUN and TURN fallback. Screen sharing
supports tab/system audio where the operating system/browser provides it.
