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

let deviceId = 'unknown';

var exec = require('child_process').exec;

let execScript = exec('~/electron/fullpageos-experimental-shell-scripts/deviceid.sh',
   (error, stdout, stderr) => {
    console.log('stdout: ' + stdout);
    console.log('stderr: ' + stderr);
});
execScript.stdout.on('data', (data) =>{
  deviceId = data;
});

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    // kiosk: true,
    webPreferences: {
      nodeIntegration: true,
      webviewTag: true
    },
    fullscreen : true
  });
  // mainWindow.webContents.openDevTools();

  // and load the index.html of the app. this page loads the webview
  mainWindow.loadURL(`file://${__dirname}/app/index.html?deviceId=${deviceId}`);

  // Open the DevTools if defined in config file.
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
    //did-attach-webview event happens only once
    mainWindow.webContents.on('did-attach-webview', (event, myWebContents) => {
      console.log(`did-attach-webview: event: ${event}, myWebContents: ${myWebContents}`);
      //myWebContents is a direct reference to the webview in index.html returned by did-attach-view
      webviewAttached = true;
      //dom-ready is an event fired every time a page finished loading into the webview
      myWebContents.on('dom-ready', () => {
        console.log(`myWebContents dom-ready`);
        //create a screenshot every time a webpage finished loading into the webview. Returns NativeImage
        mainWindow.focus();
        setTimeout(() => {
          myWebContents.capturePage((image)=>{
            if (image.isEmpty()){
              console.log('main.js myWebContents dom-ready: screenshot is empty');
              console.log(`main.js myWebContents dom-ready: image.getSize(): ${image.getSize().width}`);
            }
            else {
              console.log(`main.js myWebContents dom-ready: emitting server screenshot-message with screenshot image base64 data`)
              server.emit('screenshot-message', image.toDataURL());
            }
          })
        }, 1000);
        
      });
    });
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
  //repeatedly calls itself every 500ms until webvewAttached is true. 
  server.on('view-set-url', ({url}) => {
    if(webviewAttached){
      mainWindow.webContents.send('open-url', url);
      console.log(`main view-set-url webviewAttached: ${webviewAttached} url: ${url}`);
    }
    else {
    //sending a url to webContents could cause webview to be attached
    mainWindow.webContents.send('open-url', url);

    //monitor webview state after open-url
    console.log(`main view-set-url after webContents open-url webviewAttached: ${webviewAttached} url: ${url}`);
    
    if(!webviewAttached){
      try {
        setTimeout(() => {
          console.log('server view-set-url webview is not attached yet. re-emitting view-set-url');
          server.emit('view-set-url', ({url}));
        }, 500);
      }
      catch(err){
        console.log(err);
        }
      }
    }
  });      

server.on('server-started', ({http, portStarted}) => {
  console.log(`Server started @ ${http}:${portStarted}`);
});

server.on('dashboard-updated', (dashboards) => {
  console.log('main.js:126: dashboard-updated.');
});

server.on('toggle-fullscreen', () => {
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

process.on('uncaughtException', (err) => {
  console.log(err);
});