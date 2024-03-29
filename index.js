const express = require('express');
const cors = require('cors');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const nodemailer = require("nodemailer");
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

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

function verifyJWT(req, res, next) {

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send('unauthorized access');
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'forbidden access' })
    }
    req.decoded = decoded;
    next();
  })

}

async function run() {
  try {
    const appointmentOptionCollection = client.db('medwinCares').collection('appointmentOptions');
    const bookingsCollection = client.db('medwinCares').collection('bookings');
    const usersCollection = client.db('medwinCares').collection('users');
    const doctorsCollection = client.db('medwinCares').collection('doctors');
    const departmentsCollection = client.db('medwinCares').collection('departments');
    const shopsCollection = client.db('medwinCares').collection('shop');
    const paymentsCollection = client.db('medwinCares').collection('payments');
    const cartsCollection = client.db('medwinCares').collection('carts');
    const ordersCollection = client.db('medwinCares').collection('orders');

    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next();
    }

    app.get('/appointmentOptions', async (req, res) => {
      const date = req.query.date;
      const query = {};
      const options = await appointmentOptionCollection.find(query).toArray();
      //get the booking of provided date
      const bookingQuery = { appointmentDate: date }
      const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

      options.forEach(option => {
        const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
        const bookedSlots = optionBooked.map(book => book.slot);
        // const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
        // option.slots = remainingSlots;
      })
      res.send(options);
    });

    app.get('/appointmentSpecialty', async (req, res) => {
      const query = {}
      const result = await appointmentOptionCollection.find(query).project({ name: 1 }).toArray();
      res.send(result);
    });

    app.get('/shop', async (req, res) => {
      const query = {}
      const result = await shopsCollection.find(query).toArray();
      res.send(result)
    });

    app.get('/shop/:id', async (req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await shopsCollection.findOne(query);
      res.send(result);
    })

    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = {}
      const result = await cartsCollection.find(query).toArray()
      res.send(result)
    })

    app.post("/carts", async (req, res) => {
      const item = req.body;
      const result = cartsCollection.insertOne(item);
      console.log(result)
      res.send({ acknowledged: true });
    })

    app.get('/departments', async (req, res) => {
      const query = {}
      const result = await departmentsCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/bookings', verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const query = { email: email };
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    app.get("/allbookings", verifyJWT, verifyAdmin, async (req, res) => {
      const query = {};
      const result = await bookingsCollection.find(query).toArray()
      res.send(result)
    })

    app.get('/bookings/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const booking = await bookingsCollection.findOne(query);
      res.send(booking);
    });

    app.post('/bookings', async (req, res) => {
      const booking = req.body
      console.log(booking);
      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        treatment: booking.treatment
      }
      const alreadyBooked = await bookingsCollection.find(query).toArray();
      if (alreadyBooked.length) {
        const message = `You already have an booking on ${booking.appointmentDate}`
        return res.send({ acknowledged: false, message });
      }
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.post('/create-payment-intent', async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        currency: 'usd',
        amount: amount,
        "payment_method_types": [
          "card"
        ]
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/paymentCollection", async (req, res) => {
      const result = await paymentsCollection.find({}).toArray()
      res.send(result)
    })

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const method = req.query.method;
      const result = await paymentsCollection.insertOne(payment);
      const id = payment.bookingId
      const filter = { _id: new ObjectId(id) }
      let updatedDoc = {};
      if (method === 'card') {
        updatedDoc = {
          $set: {
            paid: 'true',
            transactionId: payment.transactionId
          }
        }
      }
      if (method === 'bkash') {
        updatedDoc = {
          $set: {
            paid: 'pending',
            transactionId: payment.transactionId
          }
        }
      }
      const updatedResult = await bookingsCollection.updateOne(filter, updatedDoc)
      res.send(result);
    })

    app.put("/payments", async( req, res ) => {
      const id = req.query.id;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {
        $set: {
          paid: 'true',
        }
      }
      const result = await bookingsCollection.updateOne(filter, updatedDoc)
      res.send(result);
    })

    app.get('/jwt', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
        return res.send({ accessToken: token });
      }
      res.status(403).asend({ accessToken: '' })
    });

    app.get('/users', async (req, res) => {
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    });

    app.get('/users/admin/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email }
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === 'admin' });
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.post('/appointmentOptions', async (req, res) => {
      const appointmentOption = req.body;
      const result = await appointmentOptionCollection.insertOne(appointmentOption);
      res.send(result);
    })

    app.post('/shop', async (req, res) => {
      const shop = req.body;
      const result = await shopsCollection.insertOne(shop);
      res.send(result);
    })

    app.get('/orders', async (req, res) => {
      const query = {};
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/myorders', async (req, res) => {
      const email = req.query.email;
      const query = {email: email};
      const result = await ordersCollection.find(query).toArray()
      res.send(result);
    })

    app.put("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      // const option = { upsert: true };
      const updatedDoc = {
        $set: {
          status: true,
        }
      }
      const result = await ordersCollection.updateOne(filter, updatedDoc)
      res.send(result);
    })

    app.post('/orders', async (req, res) => {
      const order = req.body;
      const result = await ordersCollection.insertOne(order);
      res.send(result);
    })


    app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc, options);
      res.send(result);
    });

    app.delete('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(filter);
      res.send(result);
    });

    app.delete('/shop/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await shopsCollection.deleteOne(filter);
      res.send(result);
    })

    //temporary to update price field on appointment options
    // app.get('/addPrice', async(req, res) =>{
    //   const filter = {}
    //   const options = {upsert: true};
    //   const updatedDoc = {
    //     $set: {
    //       price: 500
    //     }
    //   }
    //   const result = await appointmentOptionCollection.updateMany(filter, updatedDoc, options);
    //   res.send(result);
    // })

    app.get('/doctors', async (req, res) => {
      const query = {};
      const doctors = await doctorsCollection.find(query).toArray();
      res.send(doctors);
    });

    app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor);
      res.send(result);
    });

    app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await doctorsCollection.deleteOne(filter);
      res.send(result);
    })

  }
  finally {

  }
}
run().catch(console.log);

app.get('/', (req, res) => {
  res.send('Medwin Cares server is running');
});

app.listen(port, () => console.log(`Medwin Cares running on ${port}`))

