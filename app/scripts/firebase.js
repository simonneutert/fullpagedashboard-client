(function(){
    // Initialize Firebase
    var firebaseApp;
    var firestore;

    var config = {
        apiKey: "AIzaSyD4THmgb0VvEviPU-iyf9yW6yIYZxiWCIQ",
        authDomain: "fullpagerotator.firebaseapp.com",
        databaseURL: "https://fullpagerotator.firebaseio.com",
        projectId: "fullpagerotator",
        storageBucket: "fullpagerotator.appspot.com",
        messagingSenderId: "86135359372"
    };
    try{
        firebaseApp = firebase.initializeApp(config);
        console.log('firebase initialized with config');
    } catch(err) {
        console.log('firebase.js: no internet connection');
    }

    firebase.auth().signInAnonymously().catch(function(error) {
        // Handle Errors here.
        var errorCode = error.code;
        var errorMessage = error.message;
        console.log(errorMessage);
    });
    firebase.auth().onAuthStateChanged(user => {
        if (user){
            console.log('got user object from firebase');
            console.log(user);
            //send updates to firebase
            db = firebaseApp.firestore();
            // db.collection(user.uid).add({
            //     "test": "test"
            // })
            // Add a second document with a generated ID.
            var userDocRef = db.collection("users").doc(user.uid);
            if (!deviceId){
                deviceId = 'unknown';
            }
            userDocRef.set({
                deviceId: deviceId,
                isAnonymous: user.isAnonymous,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true })
            .then(function() {
                console.log("Document written");
                userDocRef.get().then(function(doc) {
                    if (doc.exists) {
                        console.log("Document data:", doc.data());
                    } else {
                        // doc.data() will be undefined in this case
                        console.log("No such document!");
                    }
                }).catch(function(error) {
                    console.log("Error getting document:", error);
                });
    
            })
            .catch(function(error) {
                console.error("Error adding document: ", error);
            });

        }
        else {
            console.log('no user object from firebase. do nothing');
        }
    });
}());