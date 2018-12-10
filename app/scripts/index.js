{
  const ipcRenderer = require('electron').ipcRenderer

  ipcRenderer.on('server-started', (event, message) => {
    const wrapper = document.getElementsByClassName('available-url-wrapper')[0]
    if (wrapper) {
      const link = wrapper.getElementsByClassName('available-url')[0]
      link.href = message.url
      link.innerHTML = message.url
      wrapper.style.display = 'inline'
    }
    const errorText = document.getElementById('errorText')
    const canvasElement = document.getElementById('canvas')
    if (canvasElement){
      //https://github.com/soldair/node-qrcode
      const QRCode = require('qrcode')
      let qropts = {
        errorCorrectionLevel: 'H',
        type: 'image/jpeg',
        width: '400'
      }
      QRCode.toCanvas(canvasElement, message.url, qropts, (error) => {
        if(error){
          errorText.innerHTML = "error in QRCode"
        }
        else {
          errorText.innerHTML = "Or scan the QR Code with your smartphone"
        }
      })
    }
  })

// Incoming request opening an url
  ipcRenderer.on('open-url', (event, url) => {
    document.getElementById('splashscreen').style.display = 'none'
    document.getElementById('webview').src = url
    document.getElementById('webview').style.display = 'flex'
    ipcRenderer.send('test', 'test');
  })

// Incoming request making a screenshot
  // ipcRenderer.on('screenshot-request', () => {
  //   console.log('Requesting screenshot...')
  //   var screenshot = require('electron-screenshot')
  //   const filename = '.cache/current-view.png'
  //   screenshot({filename : filename, delay : 2000}, () => {
  //     console.log('Screenshot taken')
  //     ipcRenderer.emit('screenshot-response', filename)
  //   })
  // })

 ipcRenderer.on('screenshot-request', () => {
  // ipcRenderer.send('screenshot-response', 'imageData')
  // console.log('Requesting screenshot...')
  // const appScreenshot = require('./lib/appScreenshot')
  // //const filename = '.cache/current-view.png'
  // appScreenshot({imageFormat: 'image/png'}, 
  //   (imageData) => {
  //     console.log('Screenshot taken')
  //     ipcRenderer.emit('screenshot-response', imageData)
  //     });
  return true;
    })

}
