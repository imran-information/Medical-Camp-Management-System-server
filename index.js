require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000
const app = express()

// middleware
const corsOptions = {
    origin: ['http://localhost:5173'],
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' })
        }
        req.user = decoded
        next()
    })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.eedxn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
        const db = client.db('mcms')
        const usersCollection = db.collection('users')
        const campsCollection = db.collection('camps')
        const campParticipantsCollection = db.collection('campParticipants')
        const feedbacksCollection = db.collection('feedbacks')
        const healthResourcesCollection = db.collection('healthResources')





        const verifyOrganizer = async (req, res, next) => {
            const email = req.user.email
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const isOrganizer = user.role === 'organizer';
            if (!isOrganizer) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            next()
        }

        // Generate jwt token
        app.post('/jwt', async (req, res) => {
            const email = req.body
            const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '365d',
            })
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true })
        })
        // Logout
        app.get('/logout', async (req, res) => {
            try {
                res
                    .clearCookie('token', {
                        maxAge: 0,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    })
                    .send({ success: true })
            } catch (err) {
                res.status(500).send(err)
            }
        })

        // save  a user db
        app.post('/users/:email', async (req, res) => {
            try {
                const email = req.params.email;
                const newUser = req.body
                const exitUser = await usersCollection.findOne({ email: email });
                if (exitUser) {
                    res.send({ message: 'user already exist' })
                    return;
                }
                const result = await usersCollection.insertOne({ ...newUser, role: 'participant', })
                res.send(result)
            } catch (err) {
                res.status(500).send(err)
            }
        })

        // get or  a user db
        app.get('/users/:email', async (req, res) => {
            try {
                const email = req.params.email;
                console.log(email);
                const result = await usersCollection.findOne({ email: email });
                res.send(result)
            } catch (err) {
                res.status(500).send(err)
            }
        })

        // get or  a user db
        app.patch('/users/:email', async (req, res) => {
            try {
                const email = req.params.email;

                const { email: currentEmail, name, photo } = req.body;
                const query = { email: email }
                const updateDoc = {
                    $set: {
                        email: currentEmail,
                        name: name,
                        photo: photo,
                    }
                }
                const result = await usersCollection.updateOne(query, updateDoc);
                res.send(result)
            } catch (err) {
                res.status(500).send(err)
            }
        })

        // get organizer && check if user is organizer
        app.get('/users/organizer/:email', verifyToken, async (req, res) => {
            try {
                const email = req.params.email;
                if (email !== req.user.email) return res.status(401).send({ message: 'unauthorized access' })

                const user = await usersCollection.findOne({ email: email });
                // console.log(user);
                let organizer = false;
                if (user.role === 'organizer') {
                    organizer = true;
                }
                // console.log(organizer)
                res.send({ organizer })
            } catch (err) {
                res.status(500).send(err)
            }
        });

        // post a camp data
        app.post('/camps', verifyToken, verifyOrganizer, async (req, res) => {
            try {
                const newCamp = req.body;
                const result = await campsCollection.insertOne(newCamp);
                res.send(result)
            } catch (error) {
                res.status(500).send(error)
            }
        })

        // get popular 8 camp data
        app.get('/camps', async (req, res) => {
            try {
                const result = await campsCollection.find().sort({ 'participantCount': -1 }).limit(6).toArray()
                res.send(result)
            } catch (error) {
                res.status(500).send(error)
            }
        })
        // get all  camp data
        app.get('/all-camps', async (req, res) => {
            try {
                const { search, sort } = req.query;
                console.log(sort);
                let query = {}
                if (search) {
                    query = {
                        $or: [
                            { name: { $regex: search, $options: 'i' } },
                            { location: { $regex: search, $options: 'i' } },
                        ],
                    };
                }

                let camps = await campsCollection.find(query).toArray()

                if (sort === 'participantCount') {
                    camps = camps.sort((a, b) => b.participantCount - a.participantCount);
                } else if (sort === 'fees') {
                    camps = camps.sort((a, b) => a.fees - b.fees);
                } else if (sort === 'alphabetical') {
                    camps = camps.sort((a, b) => a.name.localeCompare(b.name));
                }
                res.send(camps)
            } catch (error) {
                res.status(500).send(error)
            }
        })

        // get one camp data
        app.get('/camps/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const result = await campsCollection.findOne({ _id: new ObjectId(id) })
                res.send(result)
            } catch (error) {
                res.status(500).send(error)
            }
        })
        // update a camp data
        app.put('/camps/:id', verifyToken, verifyOrganizer, async (req, res) => {
            try {
                const id = req.params.id;
                const updateData = req.body;
                console.log(updateData);
                const query = { _id: new ObjectId(id) }
                const updateDoc = {
                    $set: {
                        ...updateData
                    }
                }
                const result = await campsCollection.updateOne(query, updateDoc)
                res.send(result)
            } catch (error) {
                res.status(500).send(error)
            }
        })

        // delete a camp data
        app.delete('/camps/:id', verifyToken, verifyOrganizer, async (req, res) => {
            try {
                const id = req.params.id;
                const result = await campsCollection.deleteOne({ _id: new ObjectId(id) })
                res.send(result)
            } catch (error) {
                res.status(500).send(error)
            }
        })

        //  post a  camp participant registration
        app.post('/camp-participant-registration', async (req, res) => {
            try {
                const participantData = req.body;
                // console.log(participantData);
                const result = await campParticipantsCollection.insertOne(participantData);
                res.send(result)
            } catch (error) {
                res.status(500).send(error)
            }
        })
        // get all registered-camps
        app.get('/registered-camps', async (req, res) => {
            try {
                const result = await campParticipantsCollection.aggregate(
                    [
                        {
                            $addFields: {
                                campId: { $toObjectId: '$campId' }
                            }
                        },
                        {
                            $lookup: {
                                from: 'camps',
                                localField: 'campId',
                                foreignField: '_id',
                                as: 'campData',
                            },
                        },
                        {
                            $unwind: '$campData',
                        },
                    ]
                ).toArray()
                res.send(result)
            } catch (error) {
                res.status(500).send(error)
            }
        })

        // get all registered-camps by email 
        app.get('/registered-camps/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            try {
                const result = await campParticipantsCollection.aggregate(
                    [
                        {
                            $match: {
                                participantEmail: email
                            }
                        },
                        {
                            $addFields: {
                                campId: { $toObjectId: '$campId' }
                            }
                        },
                        {
                            $lookup: {
                                from: 'camps',
                                localField: 'campId',
                                foreignField: '_id',
                                as: 'campData',
                            },
                        },
                        {
                            $unwind: '$campData',
                        },
                    ]
                ).toArray()
                res.send(result)
            } catch (error) {
                res.status(500).send(error)
            }

        })


        // increase/decrease a camp Participants data by id 
        app.patch('/camps/participant/:id', async (req, res) => {
            try {
                const id = req.params.id;
                console.log(id);
                // const { updatedQuantity } = req.body;
                // // console.log(updatedQuantity);
                const query = { _id: new ObjectId(id) }
                let updateDoc = {
                    $inc: {
                        participantCount: +1
                    },
                }
                // if (status === 'increase') {
                //     updateDoc = {
                //         $inc: {
                //             quantity: updatedQuantity
                //         },
                //     }
                // }
                const result = await campsCollection.updateOne(query, updateDoc)
                res.send(result)
            } catch (err) {
                res.status(500).send(err)
            }
        })


        // get feedback for a specific camp
        app.get('/feedbacks/:id', async (req, res) => {
            try {
                const campId = req.params.id;
                if (!ObjectId.isValid(campId)) {
                    return res.status(400).send({ error: "Invalid camp ID format" });
                }
                const feedbacks = await feedbacksCollection
                    .find({ campId: new ObjectId(campId) })
                    .sort({ date: -1 },)
                    .toArray();

                res.status(200).send(feedbacks);
            } catch (error) {
                console.error("Error fetching feedback:", error);
                res.status(500).send({ error: "Internal server error" });
            }
        });

        // Add feedback for a camp
        app.post('/feedbacks', async (req, res) => {
            try {
                const { campId, participantName, participantEmail, participantImage, rating, feedback, } = req.body;
                const feedbackInfo = {
                    campId: new ObjectId(campId),
                    participantName,
                    participantEmail,
                    participantImage,
                    rating: parseInt(rating),
                    feedback,
                    date: new Date().toLocaleDateString("en-CA"),
                };

                const result = await feedbacksCollection.insertOne(feedbackInfo);
                res.send(result);
            } catch (error) {
                console.error("Error submitting feedback:", error);
                res.status(500).send({ error: "Internal server error" });
            }
        });

        // get all feedbacks for  camp
        app.get('/feedbacks', async (req, res) => {
            try {
                const result = await feedbacksCollection.find().sort({ 'rating': -1 }).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ error: "Internal server error" });
            }
        });

        // Fetch all health resources
        app.get('/resources', async (req, res) => {
            try {
                const resources = await healthResourcesCollection.find({}).sort({ date: -1 }).toArray();
                res.send(resources);
            } catch (error) {
                console.error("Error fetching resources:", error);
                res.status(500).send({ error: "Internal server error" });
            }
        });

        // create payment intent 
        app.post('/create-payment-intent', verifyToken, async (req, res) => {
            try {
                const { campId } = req.body;
                // console.log(campId);

                // Find the camp
                const camp = await campsCollection.findOne({ _id: new ObjectId(campId) });

                // Check if the camp exists
                if (!camp) {
                    return res.status(400).send({ message: 'Camp Not Found' });
                }

                const stripeTotalPrice = camp.fees * 100;
                const { client_secret } = await stripe.paymentIntents.create({
                    amount: stripeTotalPrice,
                    currency: 'usd',
                    automatic_payment_methods: {
                        enabled: true,
                    },
                });
                res.send({ client_secret: client_secret });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });


        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello brother this is Medical Camp Server..')
})

app.listen(port, () => {
    console.log(`Camp is running on port ${port}`)
})