const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nullcordDesktop", {
    isDesktop: true,
    getGame: () => ipcRenderer.invoke("nullcord:get-game"),
    onGameChange: (callback) => {
        const listener = (_event, game) => callback(game);
        ipcRenderer.on("nullcord:game", listener);
        return () => ipcRenderer.removeListener("nullcord:game", listener);
    },
});
