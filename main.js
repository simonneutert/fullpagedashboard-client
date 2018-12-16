const {BrowserWindow, app, ipcMain} = require('electron');
const Server = require('./server/Server');
const OnlineStatusManager = require('./server/OnlineStatusManager');
const Config = require('./server/Config');

// Load config manager (can persist and reload)
const config = new Config(__dirname);

const server = new Server(config);

// Online-status tracking
new OnlineStatusManager(__dirname).on('changed', (isOnline) => server.emit('state-changed', 'online', isOnline));

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

let webviewAttached = false;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    fullscreen : true//,
  });

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/app/index.html`);

  // Open the DevTools.
  if (config.get('window', 'devtools')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('server-started', {url : server.getControlServerUrl()});
    // forward webview event metrics
    // ipcMain.on('webview-refreshed', (event, data) => server.emit('view-updated', data));
    // ipcMain.on('webview-favicons-refreshed', (event, data) => server.emit('view-favicons-updated', data));
    // ipcMain.on('webview-response-refreshed', (event, data) => server.emit('view-response-updated', data));
  });
    //did-attach-view event happens only once
    mainWindow.webContents.on('did-attach-webview', (event, myWebContents) => {
      console.log(`did-attach-webview: event: ${event}, myWebContents: ${myWebContents}`)
      //myWebContents is a direct reference to the webview in index.html returned by did-attach-view
      webviewAttached = true;
      //dom-ready is an event fired every time a page finished loading into the webview
      myWebContents.on('dom-ready', () => {
        console.log(`myWebContents dom-ready`)
        //create a screenshot every time a webpage finished loading into the webview. Returns NativeImage
        mainWindow.focus();
        setTimeout(() => {
          myWebContents.capturePage((image)=>{
            if (image.isEmpty()){
              console.log('main.js myWebContents dom-ready: screenshot is empty')
              console.log(`main.js myWebContents dom-ready: image.getSize(): ${image.getSize().width}`)
            }
            else {
              console.log(`main.js myWebContents dom-ready: emitting server screenshot-message with screenshot image base64 data`)
              //console.log(`main.js myWebContents dom-ready: image.toDataURL(): ${image.toDataURL()}`);
              server.emit('screenshot-message', image.toDataURL());
            }
          })
        }, 1000);
        
      })
    })
  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

  //makes sure webview URL is sent only when the webview is actually available
  server.on('view-set-url', ({url}) => {
    if(webviewAttached){
      mainWindow.webContents.send('open-url', url);
      console.log(`main: url: ${url}`);
    }
    else {
    //console.log('server view-set-url webview is not attached yet');
    mainWindow.webContents.send('open-url', url);
    try {
        setTimeout(() => {
          console.log('server view-set-url webview is not attached yet');
          server.emit('view-set-url', ({url}));
        }, 500);
      }
      catch(err){
        console.log(err);
      }
    }
  });      

server.on('server-started', ({portStarted}) => {
  console.log(`Server started @ ${portStarted}`);
});

server.on('dashboard-updated', (dashboards) => {
  //app.clearRecentDocuments();
  //app.addRecentDocument('/Users/USERNAME/Desktop/work.type');
});

server.on('toggle-fullscreen', () => {
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

process.on('uncaughtException', (err) => {
  console.log(err);
});