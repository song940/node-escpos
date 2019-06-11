'use strict';
const EventEmitter  = require('events');
const util          = require('util');

let bluetooth = null;
let device = null;
let connection = null;

/**
 * Bluetooth adapter
 * @param {string} address Bluetooth Address
 * @param {number} channel Bluetooth channel
 * @return {Bluetooth}
 * @constructor
 */
function Bluetooth(address, channel){
  EventEmitter.call(this);
  this.address = address;
  this.channel = channel;
  loadBluetoothDependency();
  device = new bluetooth.DeviceINQ();
  return this;
};

util.inherits(Bluetooth, EventEmitter);

/**
 * Load bluetooth dependency only if actually needed
 */
function loadBluetoothDependency(){
  if (!bluetooth) {
    bluetooth = require('node-bluetooth');
  }
}

/**
 * Returns an array of all available bluetooth devices with a serial port
 * @return {Promise<any[]>} Device objects with address, name, channel
 */
Bluetooth.findPrinters = async function(){
  loadBluetoothDependency();
  if (device === null) {
    device = new bluetooth.DeviceINQ();
  }
  const devices = await device.scan();
  const printers = await Promise.all(devices.map(({address, name}) => {
    return new Promise((resolve, reject) => {
      device.findSerialPortChannel(address, function(channel){
        if (channel === -1) {
          resolve(undefined);
        } else {
          resolve({
            address,
            name,
            channel
          })
        }
      });
    });
  }));
  return printers;
};

/**
 * Returns a connected Blueetooth device
 * @param {string} address Bluetooth Address
 * @param {number} channel Bluetooth channel
 * @return {Promise<any>} connected device if everything is ok, error otherwise
 */
Bluetooth.getDevice = async function(address, channel){
  return new Promise((resolve, reject) => {
    const device = new Bluetooth(address, channel);
    device.open(err => {
      if(err) return reject(err);
      resolve(device);
    });
  });
};

/**
 * Open connection to bluetooth device
 * @param callback
 */
Bluetooth.prototype.open = function(callback){
  const self = this;
  bluetooth.connect(this.address, this.channel, function(err, conn){
    if(err) {
      callback && callback(err);
    } else {
      connection = conn;
      self.emit('connect', connection);
      callback();
    }
  });
};

/**
 * Close bluetooth connection
 * @param callback
 */
Bluetooth.prototype.close = function(callback){
  if (connection === null) {
    callback && callback();
  } else {
    const self = this;
    connection.close(function(err){
      if(err) {
        callback && callback(err);
      } else {
        self.emit('disconnect', connection);
        connection = null;
        callback();
      }
    });
  }
};

/**
 * Write data to the printer
 * @param data
 * @param callback
 */
Bluetooth.prototype.write = function(data, callback) {
  if (connection === null) {
    callback && callback(new Error('No open bluetooth connection.'));
  } else {
    const self = this;
    connection.write(data, function(){
      self.emit('write', data);
      callback();
    });
  }
};

/**
 * expose
 */
module.exports = Bluetooth;
