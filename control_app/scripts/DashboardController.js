//TODO: refactor to a class and separate parts of the codes to external modules
angular.module('app')
  .controller('DashboardController', function ($rootScope, $mdDialog, $mdMedia, $mdToast, $scope, $sce) {

    var me = this;

    this.states = {
      online: false
    };

    this.webview = {
      loading: false,
      failed: false,
      title: '',
      url: null,
      fullscreen: false
    };

    this.activeDashboard = '';
    this.pendingDashboard = '';
    this.items = [];

    var socket = io(undefined, {
      timeout: 5000
    });
    socket.on('connect', () => {
      $scope.$apply(() => {
        $rootScope.$emit('server-connected');
      });
    });
    socket.on('disconnect', () => {
      $scope.$apply(() => {
        $rootScope.$emit('server-disconnected');
      });
    });
    socket.on('error', () => {
      $scope.$apply(() => {
        $rootScope.$emit('server-disconnected');
      });
    });
    socket.on('reconnect_error', () => {
      $scope.$apply(() => {
        $rootScope.$emit('server-disconnected');
      });
    });
    socket.on('dashboard-changed', (dashboard) => {
      $scope.$apply(() => {
        me.activeDashboard = dashboard.id;
        me.pendingDashboard = dashboard.id;
      });
    });

    //TODO: convert to ES6
    socket.on('dashboard-updated', (dashboard) => {
      $scope.$apply(() => {
        for (var i = 0; i < me.items.length; i++) {
          if (me.items[i].id === dashboard.id) {
            me.items[i] = dashboard;
          }
        }
      });
    });
    socket.on('dashboards-updated', (dashboards) => {
      $scope.$apply(() => {
        me.activeDashboard = dashboards.active;
        me.pendingDashboard = dashboards.active;
        me.items = dashboards.items;
      });
    });
    socket.on('states-updated', (args) => {
      $scope.$apply(() => {
        if (typeof args.online !== 'undefined') {
          me.states.online = args.online;
        }
      });
    });
    socket.on('view-updated', (data) => {
      console.log('view updated', data);
      $scope.$apply(() => {
        const webview = me.webview;
        webview.favicon = data.favicon;
        webview.failed = data.statesFailed || (data.lastResponse && data.lastResponse.httpResponseCode >= 400);
        webview.loading = data.statesLoading;
        webview.loadingShow = data.statesLoading === true;
        webview.title = data.title;
        webview.description = $sce.trustAsHtml(data.description);
        webview.url = data.url;
        webview.lastResponse = data.lastResponse;
      });
    });
    
    socket.on('screenshot-message',(data) => {
      console.log(`screenshot-message: ${data}`);
      //TODO: find out what the $rootScope is in Angular
      // $rootScope.$on('screenshot-message', (imageData) => {
        // console.log('screenshot-message');
        // console.log(imageData);
        let previewImage = document.getElementById('tabPreview');
        previewImage.src = data;
    // })

    });

    $rootScope.$on('server-connected', () => {
      me.states.connected = true;
    });

    $rootScope.$on('server-disconnected', () => {
      me.states.connected = false;
    });

    $rootScope.$on('server-connected', () => {
      socket.emit('list-dashboards', (dashboards) => {
        $scope.$apply(() => {
          me.activeDashboard = dashboards.active;
          me.pendingDashboard = dashboards.active;
          me.items = dashboards.items;
        });
      });
    });

    this.applyActive = (dashboardId) => {
      socket.emit('change-dashboard', dashboardId, (result) => {
        $scope.$apply(() => {
          if (!result.success) {
            me.pendingDashboard = me.activeDashboard;
            $mdDialog.show(
              $mdDialog.alert()
                .title('Failed')
                .textContent(result.message || 'Could not apply the dashboard.')
                .ok('Dismiss')
            );
          } else {
            me.activeDashboard = dashboardId;
            $mdToast.show(
              $mdToast.simple()
                .textContent('Changed.')
                .position('bottom right')
                .hideDelay(2000)
            );
          }
        });
      });
    };

    this.showCreateDashboardDialog = (ev) => {
      var useFullScreen = ($mdMedia('sm') || $mdMedia('xs')) && $scope.customFullscreen;
      $mdDialog.show({
        //TODO: convert to ES6
        controller: function ($scope, $mdDialog) {
          $scope.hide = () => {
            $mdDialog.hide();
          };
          $scope.cancel = () => {
            $mdDialog.cancel();
          };
          $scope.answer = (answer) => {
            $mdDialog.hide(answer);
          };
        },
        templateUrl: 'scripts/CreateDashboardDialog.html',
        parent: angular.element(document.body),
        targetEvent: ev,
        clickOutsideToClose: true,
        fullscreen: useFullScreen
      })
        .then((dashboard) => {
          if (dashboard) {
            me.createDashboard(dashboard);
          }
        }, () => {
          // TODO: find out what was supposed to be done here :)
        });
    };

    this.showRemoveDashboardDialog = (ev, dashboardId) => {
      var confirm = $mdDialog.confirm()
        .title('Would you like to delete this dashboard?')
        .ariaLabel('Yes')
        .targetEvent(ev)
        .ok('Yes, delete.')
        .cancel('Cancel');
      $mdDialog.show(confirm).then(() => {
        me.removeDashboard(dashboardId);
        $scope.status = 'You decided to get rid of your debt.';
      }, () => {
        // TODO: find out what was supposed to happen here
      });
    };

    this.showEditDashboardDialog = (ev, dashboardId) => {

      let dashboard;
      for (let i = 0; i < me.items.length; i++) {
        if (me.items[i].id === dashboardId) {
          dashboard = me.items[i];
          break;
        }
      }

      if (!dashboard) {
        return;
      }
        
      var useFullScreen = ($mdMedia('sm') || $mdMedia('xs')) && $scope.customFullscreen;
      $mdDialog.show({
        //TODO: convert to ES6
        controller: function ($scope, $mdDialog) {
          $scope.hide = () => {
            $mdDialog.hide();
          };
          $scope.cancel = () => {
            $mdDialog.cancel();
          };
          $scope.answer = (answer) => {
            $mdDialog.hide(answer);
          };
          $scope.dashboard = angular.copy(dashboard);
          $scope.editMode = true;
        },
        templateUrl: 'scripts/CreateDashboardDialog.html',
        parent: angular.element(document.body),
        targetEvent: ev,
        clickOutsideToClose: true,
        fullscreen: useFullScreen
      })
        .then((dashboard) => {
          if (dashboard) {
            me.updateDashboard(dashboard);
          }
        }, () => {
          // TODO: find out what was supposed to happen here
        });
    };

    this.createDashboard = (dashboard) => {
      socket.emit('create-dashboard', dashboard, (result) => {
        $scope.$apply(() => {
          if (!result.success) {
            $mdDialog.show(
              $mdDialog.alert()
                .title('Failed')
                .textContent(result.message || 'Could not create the dashboard.')
                .ok('Dismiss')
            );
          } else {
            $mdToast.show(
              $mdToast.simple()
                .textContent('Created.')
                .position('bottom right')
                .hideDelay(2000)
            );
          }
        });
      });
    };

    this.removeDashboard = (dashboardId) => {
      socket.emit('remove-dashboard', dashboardId, (result) => {
        $scope.$apply(() => {
          if (!result.success) {
            $mdDialog.show(
              $mdDialog.alert()
                .title('Failed')
                .textContent(result.message || 'Could not remove the dashboard.')
                .ok('Dismiss')
            );
          } else {
            $mdToast.show(
              $mdToast.simple()
                .textContent('Removed.')
                .position('bottom right')
                .hideDelay(2000)
            );
          }
        });
      });
    };

    this.toggleFullscreen = () => {
      socket.emit('toggle-fullscreen', (result) => {
        $scope.$apply(() => {
          if (!result.success) {
            $mdDialog.show(
              $mdDialog.alert()
                .title('Failed')
                .textContent(result.message || 'Could not switch fullscreen.')
                .ok('Dismiss')
            );
          } else {
            $mdToast.show(
              $mdToast.simple()
                .textContent('switch fullscreen.')
                .position('bottom right')
                .hideDelay(2000)
            );
          }
        });
      });
    };

    this.updateDashboard = (dashboard) => {
      socket.emit('update-dashboard', dashboard, (result) => {
        $scope.$apply(() => {
          if (!result.success) {
            $mdDialog.show(
              $mdDialog.alert()
                .title('Failed')
                .textContent(result.message || 'Could not edit the dashboard.')
                .ok('Dismiss')
            );
          } else {
            $mdToast.show(
              $mdToast.simple()
                .textContent('edit complete.')
                .position('bottom right')
                .hideDelay(2000)
            );
          }
        });
      });
    };

    this.reload = () => {
      me.applyActive(me.activeDashboard);
    };
  });