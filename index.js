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
    origin: ['http://localhost:5173', 'https://medical-camp-management-1b67d.web.app'],
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
        // Logout user
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
                const { search, sort, page, size } = req.query;
                const perPage = parseInt(page);
                const dataSize = parseInt(size);

                let query = {};
                if (search) {
                    query = {
                        $or: [
                            { name: { $regex: search, $options: 'i' } },
                            { location: { $regex: search, $options: 'i' } },
                            { date: { $regex: search, $options: 'i' } },
                            { healthcareProfessional: { $regex: search, $options: 'i' } },
                        ],
                    };
                }

                let sortOption = {};
                if (sort === 'participantCount') {
                    sortOption = { participantCount: -1 }; // Descending by participantCount
                } else if (sort === 'fees') {
                    sortOption = { fees: 1 }; // Ascending by fees
                } else if (sort === 'alphabetical') {
                    sortOption = { name: 1 }; // Alphabetical order (ascending)
                }
                const campCount = await campsCollection.estimatedDocumentCount()
                console.log(campCount);
                const camps = await campsCollection.find(query).sort(sortOption).skip(perPage * dataSize).limit(dataSize).toArray();
                res.send({ allCamp: camps, campCount: campCount });
            } catch (error) {
                console.error('Error fetching camps:', error);
                res.status(500).send({ error: 'Failed to fetch camps' });
            }
        });

        // get all camp data Only organizer 
        app.get('/all-camps-organizer', verifyToken, verifyOrganizer, async (req, res) => {
            try {
                const { search, sort, page, size } = req.query;
                const perPage = parseInt(page);
                const dataSize = parseInt(size);

                let query = {};
                if (search) {
                    query = {
                        $or: [
                            { name: { $regex: search, $options: 'i' } },
                            { location: { $regex: search, $options: 'i' } },
                            { date: { $regex: search, $options: 'i' } },
                            { healthcareProfessional: { $regex: search, $options: 'i' } },
                        ],
                    };
                }

                let sortOption = { date: -1 };
                const campCount = await campsCollection.estimatedDocumentCount()
                console.log(campCount);
                const camps = await campsCollection.find(query).sort(sortOption).skip(perPage * dataSize).limit(dataSize).toArray();
                res.send({ allCamp: camps, campCount: campCount });
            } catch (error) {
                console.error('Error fetching camps:', error);
                res.status(500).send({ error: 'Failed to fetch camps' });
            }
        });

        // get one camp data
        app.get('/camps/:id', verifyToken, async (req, res) => {
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
        app.post('/camp-participant-registration', verifyToken, async (req, res) => {
            try {
                const participantData = req.body;
                const email = participantData?.participantEmail;
                const campId = participantData?.campId;
                const exists = await campParticipantsCollection.findOne({ participantEmail: email, campId: campId })
                if (exists) {
                    return res.status(400).send({ message: 'Already Registered this camp' })
                }

                const participantCurrent = {
                    age: participantData.age,
                    phoneNumber: participantData.phoneNumber,
                    gender: participantData.gender,
                    emergencyContact: participantData.emergencyContact,
                    participantName: participantData.participantName,
                    participantEmail: participantData.participantEmail,
                    campId: participantData.campId,
                    confirmationStatus: 'Pending',
                    paymentStatus: 'Pay',
                }
                const result = await campParticipantsCollection.insertOne(participantCurrent);
                res.send(result)
            } catch (error) {
                res.status(500).send(error)
            }
        })
        // get all payed  registered-camps only organizer  
        app.get('/registered-camps', verifyToken, verifyOrganizer, async (req, res) => {
            try {
                const { search, page, size } = req.query;
                // console.log(search);
                const perPage = parseInt(page);
                const dataSize = parseInt(size);
                let searchQuery = {};
                if (search) {
                    searchQuery = {
                        $or: [
                            { participantName: { $regex: search, $options: 'i' } }, // Participant name
                            { confirmationStatus: { $regex: search, $options: 'i' } }, // confirmationStatus status

                        ],
                    };
                }
                const options = { paymentStatus: "Paid" }
                const campParticipantCount = await campParticipantsCollection.countDocuments(options)
                const result = await campParticipantsCollection.aggregate([
                    {
                        $match: {
                            paymentStatus: "Paid",
                            ...searchQuery,
                        },
                    },
                    {
                        $addFields: {
                            campId: { $toObjectId: '$campId' },
                        },
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
                ]).skip(perPage * dataSize).limit(dataSize).toArray();

                res.send({ campParticipant: result, campParticipantCount: campParticipantCount });
            } catch (error) {
                console.error("Error retrieving registered camps:", error);
                res.status(500).send(error); // Return a 500 error response in case of an issue
            }
        });



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
        app.patch('/camps/participant/:id', verifyToken, async (req, res) => {
            try {
                const id = req.params.id;
                const { status } = req.body;
                console.log(id, status);
                const query = { _id: new ObjectId(id) }
                let updateDoc = {
                    $inc: {
                        participantCount: +1
                    },
                }
                if (status === 'decrease') {
                    updateDoc = {
                        $inc: {
                            participantCount: -1
                        },
                    }
                }
                const result = await campsCollection.updateOne(query, updateDoc)
                res.send(result)
            } catch (err) {
                res.status(500).send(err)
            }
        })
        // update a specific user camp	Payment Status 
        app.patch('/registered-camp-status', verifyToken, async (req, res) => {
            const { campId, } = req.body;
            // console.log(campId );
            const email = req.user.email;
            const participantCamp = await campParticipantsCollection.findOne({ campId: campId, participantEmail: email })
            // console.log(participantCamp);
            if (!participantCamp) {
                return res.status(400).send({ message: "Registered Camp Id nul" })
            }
            let updateDoc = {
                $set: {
                    confirmationStatus: "Processing",
                    paymentStatus: "Paid",
                }
            }
            const updatedRegisteredCamp = await campParticipantsCollection.updateOne({ campId: campId }, updateDoc)
            // console.log(updatedRegisteredCamp);
            res.send(updatedRegisteredCamp)
        })

        // update  a specific registered camp  only organizer Confirmation Status 
        app.patch('/registered-camp-status-organizer', verifyToken, verifyOrganizer, async (req, res) => {
            const { campId, confirmationStatus, participantEmail } = req.body;
            console.log(campId, confirmationStatus, participantEmail);
            const participantCamp = await campParticipantsCollection.findOne({ _id: new ObjectId(campId), participantEmail: participantEmail })
            console.log(participantCamp);
            if (!participantCamp) {
                return res.status(400).send({ message: "Registered Camp Id nul" })
            }
            let updateDoc = {}
            if (confirmationStatus === 'Confirmed') {
                updateDoc = {
                    $set: {
                        confirmationStatus: "Confirmed",

                    }
                }
            }
            const updatedRegisteredCamp = await campParticipantsCollection.updateOne({ _id: new ObjectId(campId) }, updateDoc)
            console.log(updatedRegisteredCamp);
            res.send(updatedRegisteredCamp)
        })
        // delete a specific camp only organizer 
        app.delete('/registered-camp-delete-organizer/:id', verifyToken, verifyOrganizer, async (req, res) => {
            const campId = req.params.id;
            const result = await campParticipantsCollection.deleteOne({ _id: new ObjectId(campId) })
            console.log(result);
            res.send(result)

        })

        // delete a specific user registered camp 
        app.delete('/registered-camp-delete/:campId', verifyToken, async (req, res) => {
            const email = req.user.email;
            const campId = req.params.campId;
            const result = await campParticipantsCollection.deleteOne({ campId: campId, participantEmail: email })
            console.log(result);
            res.send(result)

        })


        // get feedback for a specific camp
        app.get('/feedbacks/:id', verifyToken, async (req, res) => {
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
        app.post('/feedbacks', verifyToken, async (req, res) => {
            try {
                const { campId, participantName, participantEmail, participantImage, rating, feedback, } = req.body;
                const feedbackInfo = {
                    campId: campId,
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
                const resources = await healthResourcesCollection.find().sort({ date: -1 }).limit(8).toArray();
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