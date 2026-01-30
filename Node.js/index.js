const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(require("./serviceAccountKey.json"))
});

const db = admin.firestore();

db.listCollections()
  .then(cols => console.log("Collections:", cols.map(c => c.id)))
  .catch(err => console.error(err));
