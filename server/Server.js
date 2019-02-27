const EventEmitter = require('eventemitter3');

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

//code snippet from stackeoverflow user vault. https://stackoverflow.com/questions/3653065/get-local-ip-address-in-node-js/31003950#31003950
//a hack to get a local ip address of the server machine from the list of network interfaces
//setting host global variable. 
let host = '';

try{
  host = require('underscore')
  .chain(require('os').networkInterfaces())
  .values()
  .flatten()
  .find({family: 'IPv4', internal: false})
  .value()
  .address;
} catch(err){
  host = 'raspberrypi.local';
}

//global variable for rotateItems() setTimeout(). 
//use clearTimeout(netItemTimeout); to cancel next scheduled item.
let nextItemTimeout = '';

class Server extends EventEmitter {

  constructor(config) {
    super();
    this.basePath = config.basePath || `${__dirname}/..`;
    this.config = config;
    //this will always return 33333 because server.port is not 
    //implemented. 
    this.serverPort = config.get('server', 'port', 33333);
    this.appServer = express();
    this.httpServer = http.Server(this.appServer);
    this.host = host;
    this.ioServer = socketIo(this.httpServer);
    this.initialize();
    this.start();
  }

  initialize() {
    const appBasePath = `${__dirname}/../control_app`;
    const dependenciesPath = `${__dirname}/../node_modules`;
    const cachePath = `${__dirname}/../.cache`;
    this.appServer.use('/', express.static(appBasePath));
    this.appServer.use('/node_modules', express.static(dependenciesPath));

    // Configure cache directory
    this.appServer.use('/.cache', express.static(cachePath, {
      setHeaders : (res, path, stat) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
        res.setHeader('Expires', '0');
        res.setHeader('Pragma', 'no-cache');
      }
    }));

    this.states = {};
    this.webviewData = {};

    // bridge Socket.IO events
    //TODO: refactor to Promises instead of callbacks
    this.ioServer.on('connection', (socket) => {
      socket.on('list-dashboards', (fn) => {
        fn(this.getDashboards());
      });
      socket.on('change-dashboard', (dashboardId, fn) => {
        this.changeDashboard(dashboardId, fn);
      });
      socket.on('create-dashboard', (dashboard, fn) => {
        this.createDashboard(dashboard, fn);
      });
      socket.on('remove-dashboard', (dashboardId, fn) => {
        this.removeDashboard(dashboardId, fn);
      });
      socket.on('toggle-fullscreen', (fn) => {
        this.toggleFullscreen(fn);
      });
      socket.on('update-dashboard', (dashboard, fn) => {
        this.updateDashboard(dashboard, fn);
      });

      if (this.states) {
        socket.emit('states-updated', this.states);
      }
      if (this.webviewData) {
        socket.emit('view-updated', this.webviewData);
      }
    });

    this.on('state-changed', (name, value) => {
      this.states[name] = value;
      this.ioServer.emit('states-updated', this.states);
    });
    //TODO: refactor to use generator hack instead of object keys
    this.on('states-changed', (data) => {
      for (let key of Object.keys(data)) {
        this.states[key] = data[key];
      }
      this.ioServer.emit('states-updated', this.states);
    });
    this.on('view-updated', (data) => {
      for (let key of Object.keys(data)) {
        this.webviewData[key] = data[key];
      }
      this.ioServer.emit('view-updated', this.webviewData);
    });
    this.on('view-favicons-updated', (favicons) => {
      this.webviewData.favicon = favicons[0];
      this.ioServer.emit('view-updated', this.webviewData);
    });
    this.on('view-response-updated', (response) => {
      this.webviewData.lastResponse = response;
      this.ioServer.emit('view-updated', this.webviewData);
    });
    this.on('screenshot-message', (data) => { this.ioServer.emit('screenshot-message', data)} );
  } //initialize

  rotateItems(itemIndex, fn){

    const items = this.config.get('dashboards', 'items', []);

    items.map((itemObject) => {
      console.log(`Server.rotateItems: items array member item: ${JSON.stringify(itemObject)}` );
    });

    const item = items[itemIndex];
    console.log(`Server.rotateItems(): would like to display items[${itemIndex}]: ${JSON.stringify(item)} `);
    //there is actually an item. proceed
    if (item !== undefined && item.url !== undefined || 
      (this.config.get('dashboards', 'defaultURL', null)))
    {
      console.log(`Server.rotateItem(): item.url: ${item.url} `);
      //   //load the item  
        this.changeDashboard((item.id), ({success}) => {
          if (!success) {
            this.config.put('dashboards', 'active', undefined);
          } else {  
              //changeDashboard succeeded. Time next item.
              if (fn) {
                fn({success : true, message : `item.id ${item.id} loaded successfully`});
              }        
              //default next item index in case we are at the last one.
              let nextItemIndex = 0;
              if(itemIndex < (items.length - 1)){
                //there are still more items
                nextItemIndex = itemIndex + 1;
              } 
              //make sure there isn't only one item
              if (nextItemIndex !== itemIndex){
                //set time to run   
                nextItemTimeout = setTimeout(() => {
                  this.rotateItems(nextItemIndex);
                }, item.duration || this.config.get('dashboards', 'defaultDuration', 5000));                
              }
          }
        });
    }
  }//rotateItem

  start() {
    this.httpServer.listen(this.serverPort, () => {
      this.emit('server-started', {http : this.host, portStarted : this.serverPort});
    });

      console.log(`Server.start() calling rotateItems(0)`);
      setTimeout(() => {
        this.rotateItems(0, (result) => {
          if(result.success){
            console.log('server.start(): server.rotateItems returned success');
          }
        });
      }, 1000);
    // } else {
      // this.config.save();
    // }
  }

  changeDashboard(dashboardId, fn) {
    let dashboard = this.config.get('dashboards', 'items', []).filter((db) => db.id === dashboardId)[0];
    if (!dashboard) {
      if (fn) {
        console.warn(`Cannot change webview URL. Dashboard ${dashboardId} not found in playlist`);
        fn({success : false, message : `Cannot change webview URL. Dashboard ${dashboardId} not found in playlist`});
      }
      this.config.save(); //TODO: why do I have to save the config here?
    } else {
      this.config.put('dashboards', 'active', dashboard.id)
      this.applyViewUrl({url : dashboard.url, username: dashboard.username , password: dashboard.password});
      if (fn) {
        fn({success : true});
      }
      this.ioServer.emit('dashboard-changed', dashboard);
      this.webviewData.description = dashboard.description;
      this.config.save();
    }
  } //changeDashboard

  createDashboard(dashboard, fn) {
    if (!(dashboard && dashboard.id && dashboard.display && dashboard.url)) {
      if (fn) {
        console.warn(`Dashboard ${dashboard.id} not complete`);
        fn({success : false, message : `Dashboard ${dashboard.id} not complete`});
      }
    } else {
      if (this.config.get('dashboards', 'items', []).filter((db) => db.id === dashboard.id)[0]) {
        if (fn) {
          console.warn(`Dashboard ${dashboard.id} already present`);
          fn({success : false, message : `Dashboard ${dashboard.id} already present`});
        }
      } else {
        const items = this.config.get('dashboards', 'items', []);
        items.push(dashboard);
        this.config.put('dashboards', 'items', items);
        if (fn) {
          fn({success : true});
        }
        this.ioServer.emit('dashboards-updated', this.getDashboards());
        this.config.save();
      }
    }
  } //createDashboard

  removeDashboard(dashboardId, fn) {
    let dashboard = this.config.get('dashboards', 'items', []).filter((db) => db.id === dashboardId)[0];
    if (!dashboard) {
      if (fn) {
        console.warn(`Dashboard ${dashboardId} not found`);
        fn({success : false, message : `Dashboard ${dashboardId} not found`});
      }
    } else {
      this.config.put('dashboards', 'items', this.config.get('dashboards', 'items', []).filter((db) => db.id !== dashboardId));
      if (fn) {
        fn({success : true});
      }
      this.ioServer.emit('dashboards-updated', this.getDashboards());

      if (this.config.get('dashboards', 'active') === dashboardId) {
        const firstDashboard = this.config.get('dashboards', 'items', [])[0];
        if (firstDashboard) {
          this.changeDashboard(firstDashboard.id);
        } else {
          // TODO: fix use case no dashboard left
          this.config.save();
        }
      } else {
        this.config.save();
      }
    }
  } //removeDashboard

  /**
   * 
   * @param {*} inDashboardUpdate 
   * @param {*} fn 
   */
  updateDashboard(inDashboardUpdate, fn) {
    let dashboardId = inDashboardUpdate.id;
    let dashboard = this.config.get('dashboards', 'items', []).filter((db) => db.id === dashboardId)[0];
    if (!dashboard) {
      if (fn && dashboardId) {
        console.warn(`Dashboard ${dashboardId} not found`);
        fn({success : false, message : `Dashboard ${dashboardId} not found`});
      }
    } else {
      const items = this.config.get('dashboards', 'items', []);
      // update
      items.filter((db) => db.id === dashboardId)
        .map((db) => {
          db.display = inDashboardUpdate.display;
          db.url = inDashboardUpdate.url;
          db.description = inDashboardUpdate.description;
          db.username = inDashboardUpdate.username;
          db.password = inDashboardUpdate.password;
          db.duration = inDashboardUpdate.duration;
        });
      this.config.put('dashboards', 'items', items);
      if (fn) {
        fn({success: true});
      }
      this.ioServer.emit('dashboards-updated', this.getDashboards());
      this.config.save();

      // send update of new url
      if (this.config.get('dashboards', 'active') === dashboardId) {
        this.applyViewUrl({url: inDashboardUpdate.url, username: inDashboardUpdate.username , password: inDashboardUpdate.password});
      }
    }
  } //updateDashboard

  stop() {
    this.emit('server-stopped');
  } //stop

  applyViewUrl({url, username, password}) {
    if (username && password) {
      var indexOfLink = url.indexOf('://') + 3;
      url = url.substring(0, indexOfLink) + username + ":" + password + "@" + url.substring(indexOfLink);
    }
    this.emit('view-set-url', {url});
  } //applyViewUrl

  getControlServerUrl() {
    return `http://${this.host}:${this.serverPort}/`;
  } //getControlServerUrl

  getDashboards() {
    return {
      active : this.config.get('dashboards', 'active'),
      items : this.config.get('dashboards', 'items', [])
    };
  } //getDashboards

  // Incoming fullscreen request
  toggleFullscreen(fn){
    this.emit('toggle-fullscreen');
    if (fn) {
      fn({success : true});
    }
  } //toggleFullscreen

}

module.exports = Server;