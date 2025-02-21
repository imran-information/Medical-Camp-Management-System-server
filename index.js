require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')

const port = process.env.PORT || 5000
const app = express()

// middleware
const corsOptions = {
    origin: ['http://localhost:5173', 'https://task-management-applicat-c04f4.web.app'],
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
        const db = client.db('task-management')
        const usersCollection = db.collection('users')
        const tasksCollection = db.collection('tasks')

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
                const result = await usersCollection.insertOne({ ...newUser, role: 'user', })
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

        // post a task data
        app.post('/tasks', async (req, res) => {
            try {
                const newTask = req.body;
                const result = await tasksCollection.insertOne(newTask);
                res.send(result)
            } catch (error) {
                res.status(500).send(error)
            }
        })

        // // get all  task data
        app.get('/all-task', async (req, res) => {
            try {
                const { email } = req.query
                const tasks = await tasksCollection.find({ email: email }).toArray()
                res.send(tasks)
            } catch (error) {
                console.error('Error fetching tasks:', error);

            }
        });

        // get one task data
        app.get('/tasks/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const result = await tasksCollection.findOne({ _id: new ObjectId(id) })
                res.send(result)
            } catch (error) {
                res.status(500).send(error)
            }
        })

        // Update task category based on the task ID
        app.put('/tasks/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const updateData = req.body;
                const query = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        ...updateData, // update task category and other fields
                    }
                };

                const result = await tasksCollection.updateOne(query, updateDoc);
                res.send(result);
            } catch (error) {
                res.status(500).send(error);
            }
        });
        
        // delete a task data
        app.delete('/tasks/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) })
                res.send(result)
            } catch (error) {
                res.status(500).send(error)
            }
        })


        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello brother this is Task Management Server..')
})

app.listen(port, () => {
    console.log(`Task Management is running on port ${port}`)
})