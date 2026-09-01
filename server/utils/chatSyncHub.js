const { EventEmitter } = require('events');

const chatEmitter = new EventEmitter();
const orderEmitter = new EventEmitter();

function publishChatEvent(event) {
  chatEmitter.emit('chat-event', {
    ...event,
    at: new Date().toISOString(),
  });
}

function subscribeChatEvents(handler) {
  chatEmitter.on('chat-event', handler);
  return () => chatEmitter.off('chat-event', handler);
}

function publishOrderEvent(event) {
  orderEmitter.emit('order-event', {
    ...event,
    at: new Date().toISOString(),
  });
}

function subscribeOrderEvents(handler) {
  orderEmitter.on('order-event', handler);
  return () => orderEmitter.off('order-event', handler);
}

module.exports = {
  publishChatEvent,
  subscribeChatEvents,
  publishOrderEvent,
  subscribeOrderEvents,
};