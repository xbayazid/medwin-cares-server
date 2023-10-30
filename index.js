const express = require('express');
const cors = require('cors');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();

//middleware
app.use(cors());
app.use(express.json());


// MongoDB connection started 
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.b699yx9.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);
// MongoDB connection ended 

async function run(){
  try{
    const appointmentOptionCollection = client.db('medwinCares').collection('appointmentOptions');
    const bookingsCollection = client.db('medwinCares').collection('bookings');

    app.get('/appointmentOptions', async(req, res) =>{
      const query = {};
      const options = await appointmentOptionCollection.find(query).toArray();
      res.send(options)
    })

    app.post('/bookings', async(req, res) =>{
      const booking = req.body
      console.log(booking);
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    })
  }
  finally{

  }
}
run().catch(console.log);

app.get('/', (req, res) =>{
    res.send('Medwin Cares server is running');
});

app.listen(port, () => console.log(`Medwin Cares running on ${port}`))

