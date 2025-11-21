import type { Message } from "discord.js";
import { replyToChatBotMessage } from "./main.js";

const messageQueue: Message<true>[] = [];
let executingQueue = false;

export function addToQueue(message: Message<true>) {
    messageQueue.push(message);
    executeQueue();
}

function executeQueue() {
    if (executingQueue) {
        return;
    }
    // Take the first message in the queue
    const message = messageQueue.shift();
    // If the message is undefined, it means the queue is empty
    if (!message) {
        return;
    }
    executingQueue = true;
    replyToChatBotMessage(message).then(() => {
        executingQueue = false;
        executeQueue();
    });
}
