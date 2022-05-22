const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.renkm.mongodb.net/doctors_admin?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
console.log(uri);

//payment
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// verify Token

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "You are unAuthorized" });
  }
  const token = authHeader.split(" ")[1];
  // console.log(authHeader);
  // console.log(token);
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    // console.log("data base working");
    const ServiceCollection = client
      .db("doctors_portal")
      .collection("services");
    const BookingCollection = client.db("doctors_portal").collection("booking");
    const UserCollection = client.db("doctors_portal").collection("users");
    const DoctorCollection = client.db("doctors_portal").collection("doctors");

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      console.log("res", requester);
      const requesterAccount = await UserCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    };

    //payment API
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const price = req.body.price;
      const amount = price * 100;
      // console.log(amount);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      console.log(paymentIntent.client_secret);
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // admin Api
    app.put(
      "/user/admin/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await UserCollection.updateOne(filter, updateDoc);
        return res.send({ result });
      }
    );

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await UserCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    // user Api
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };

      const updateDoc = {
        $set: user,
      };
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1d" }
      );
      const result = await UserCollection.updateOne(filter, updateDoc, options);
      res.send({ result, token });
    });

    app.get("/user", verifyToken, async (req, res) => {
      const users = await UserCollection.find().toArray();
      res.send(users);
    });

    //service details```
    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = ServiceCollection.find(query).project({ name: 1 });
      const services = await cursor.toArray();
      res.send(services);
    });

    app.get("/available", async (req, res) => {
      const date = req.query.date;
      console.log(date);

      //step 1 : get all services
      const services = await ServiceCollection.find().toArray();

      //step 2 : get the booking of the day
      const query = { date: date };
      const bookings = await BookingCollection.find(query).toArray();

      //step 3 : for each service find booking for that service
      services.forEach((service) => {
        const serviceBookings = bookings.filter(
          (b) => b.treatment === service.name
        );
        // service.booked = serviceBookings.map((s) => s.slot);
        const booked = serviceBookings.map((s) => s.slot);
        const available = service.slots.filter((s) => !booked.includes(s));
        service.slots = available;
      });

      res.send(services);
    });

    /* Api naming convention
     * app.get('/booking') -> get all booking in the collection . or get more than one or by filter
     * app.get('/booking/:id) -> get a specific booking
     * app.post('/booking) -> add a new book
     * app.put('/booking/:id) -> if exit then update or if doesn't exit thn crate
     * app.patch('/booking/:id)
     * add.delete('/booking/:id)
     */

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exist = await BookingCollection.findOne(query);
      if (exist) {
        return res.send({ success: false, booking: exist });
      }
      const result = await BookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    });

    app.get("/booking", verifyToken, async (req, res) => {
      // const authorization = req.headers.authorization;
      const patient = req.query.patient;
      // console.log(authorization);
      const decodedEmail = req.decoded.email;

      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await BookingCollection.find(query).toArray();
        return res.send(bookings);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });

    app.get("/booking/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await BookingCollection.findOne(query);
      res.send(booking);
    });

    app.post("/doctor", verifyToken, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      console.log(doctor);
      const result = await DoctorCollection.insertOne(doctor);
      res.send(result);
    });

    app.get("/doctor", verifyToken, verifyAdmin, async (req, res) => {
      const doctors = await DoctorCollection.find().toArray();
      res.send(doctors);
    });

    app.delete("/doctor/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const doctorsDelete = await DoctorCollection.deleteOne(filter);
      res.send(doctorsDelete);
    });
  } finally {
  }
}

run().catch(console.dir);

// root
app.get("/", (req, res) => {
  res.send("Doctors Portal running");
});

app.listen(port, () => {
  console.log("Server is running : ", port);
});
