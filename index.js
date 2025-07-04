require("dotenv").config();
const express = require("express");
const path = require("path");
const {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicMessageQuery,
} = require("@hashgraph/sdk");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const myAccountId = process.env.MY_ACCOUNT_ID;
const myPrivateKey = process.env.MY_PRIVATE_KEY;

const client = Client.forTestnet().setOperator(myAccountId, myPrivateKey);

// Store topic ID
let topicId = null;
let taskStore = [];

// Create a new topic when server starts
async function createTopic() {
  const tx = await new TopicCreateTransaction().execute(client);
  const receipt = await tx.getReceipt(client);
  topicId = receipt.topicId;
  console.log("Created Topic ID:", topicId.toString());
}

createTopic();

// Endpoint to submit a task
app.post("/add", async (req, res) => {
  try {
    const { task } = req.body;
    if (!topicId || !task) return res.status(400).send("Missing topic or task");

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify({ task, done: false }))
      .execute(client);

    const receipt = await tx.getReceipt(client);
    const transactionId = tx.transactionId.toString();
    const explorerUrl = `https://hashscan.io/testnet/transaction/${transactionId}`;

    res
      .status(200)
      .json({ message: "Task added to Hedera", explorer: explorerUrl });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error submitting task");
  }
});

// Endpoint to fetch tasks
app.get("/tasks", async (req, res) => {
  try {
    const messages = [];
    await new TopicMessageQuery()
      .setTopicId(topicId)
      .setStartTime(0)
      .subscribe(
        client,
        null,
        (msg) => {
          try {
            const data = JSON.parse(msg.contents.toString());
            messages.push(data);
          } catch (e) {
            console.error("Invalid task format");
          }
        },
        (error) => {
          console.error("Query error:", error);
        }
      );

    setTimeout(() => res.json(messages), 2000);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch tasks");
  }
});

// const axios = require('axios');

// app.get("/tasks", async (req, res) => {
//   try {
//     const response = await axios.get(`https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages`);
//     const tasks = response.data.messages.map(m => JSON.parse(Buffer.from(m.message, 'base64').toString()));
//     res.json(tasks.filter(t => !t.done));
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Failed to fetch tasks");
//   }
// });

app.post("/complete", async (req, res) => {
  try {
    const { task } = req.body;
    if (!task) return res.status(400).send("Missing task");

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify({ task, done: true }))
      .execute(client);

    const receipt = await tx.getReceipt(client);
    const transactionId = tx.transactionId.toString();
    const explorerUrl = `https://hashscan.io/testnet/transaction/${transactionId}`;

    taskStore = taskStore.filter((t) => t !== task);
    res.status(200).json({ message: "Task completed", explorer: explorerUrl });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error completing task");
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () =>
  console.log(`Hedera TodoChain running at http://localhost:${PORT}`)
);
