const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

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

async function run() {
  try {
    await client.connect();
    // console.log("data base working");
    const ServiceCollection = client
      .db("doctors_portal")
      .collection("services");

    const BookingCollection = client.db("doctors_portal").collection("booking");

    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = ServiceCollection.find(query);
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

    app.get("/booking", async (req, res) => {
      const patient = req.query.patient;
      const query = { patient: patient };
      const bookings = await BookingCollection.find(query).toArray();
      res.send(bookings);
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
