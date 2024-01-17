'use strict';
const os = require('os');
import { Adapter } from "escpos-adapter";
import { usb, getDeviceList, findByIds } from 'usb';

/**
 * [USB Class Codes ]
 * @type {Object}
 * @docs http://www.usb.org/developers/defined_class
 */
const IFACE_CLASS = {
  AUDIO: 0x01,
  HID: 0x03,
  PRINTER: 0x07,
  HUB: 0x09
};

export default class USBAdapter extends Adapter<[timeout?: number]> {
  constructor(vid?: number, pid?: number) {
    super();
    let self = this;
    this.device = null;
    if (vid && pid) {
      this.device = findByIds(vid, pid);
    } else if (vid) {
      // Set spesific USB device from devices array as coming from USB.findPrinter() function.
      // for example
      // let devices = escpos.USB.findPrinter();
      // => devices [ Device1, Device2 ];
      // And Then
      // const device = new escpos.USB(Device1); OR device = new escpos.USB(Device2);
      this.device = vid;
    } else {
      let devices = USBAdapter.findPrinter();
      if (devices && devices.length)
        this.device = devices[0];
    }
    if (!this.device)
      throw new Error('Can not find printer');

    usb.usb.on('detach', function (device) {
      if (device == self.device) {
        self.emit('detach', device);
        self.emit('disconnect', device);
        self.device = null;
      }
    });

    return this;
  }
  static findPrinter() {
    return getDeviceList().filter(function (device) {
      try {
        return device.configDescriptor?.interfaces.filter(function (iface) {
          return iface.filter(function (conf) {
            return conf.bInterfaceClass === IFACE_CLASS.PRINTER;
          }).length;
        }).length;
      } catch (e) {
        // console.warn(e)
        return false;
      }
    });
  }
  static getDevice(vid: number, pid: number) {
    return new Promise((resolve, reject) => {
      try {
        const device = findByIds(vid, pid);
        device?.open();
        resolve(device);
      } catch (err) {
        reject(err);
      }
    });
  };
  open(callback?: ((error: Error | null) => void) | undefined): this {
    let self = this, counter = 0, index = 0;
    this.device.open();
    this.device.interfaces.forEach(function (iface: any) {
      (function (iface) {
        iface.setAltSetting(iface.altSetting, function () {
          try {
            // http://libusb.sourceforge.net/api-1.0/group__dev.html#gab14d11ed6eac7519bb94795659d2c971
            // libusb_kernel_driver_active / libusb_attach_kernel_driver / libusb_detach_kernel_driver : "This functionality is not available on Windows."
            if ("win32" !== os.platform()) {
              if (iface.isKernelDriverActive()) {
                try {
                  iface.detachKernelDriver();
                } catch (e) {
                  console.error("[ERROR] Could not detatch kernel driver: %s", e)
                }
              }
            }
            iface.claim(); // must be called before using any endpoints of this interface.
            iface.endpoints.filter(function (endpoint: any) {
              if (endpoint.direction == 'out' && !self.endpoint) {
                self.endpoint = endpoint;
              }
              if (endpoint.direction == 'in' && !self.deviceToPcEndpoint) {
                self.deviceToPcEndpoint = endpoint;
              }
            });
            if (self.endpoint) {
              self.emit('connect', self.device);
              callback && callback(null);
            } else if (++counter === self.device.interfaces.length && !self.endpoint) {
              callback && callback(new Error('Can not find endpoint from printer'));
            }
          } catch (err: any) {
            // Try/Catch block to prevent process from exit due to uncaught exception.
            // i.e LIBUSB_ERROR_ACCESS might be thrown by claim() if USB device is taken by another process
            // example: MacOS Parallels
            callback && callback(err);
          }
        });
      })(iface);
    });
    return this;
  }
  read(callback?: ((data: Buffer) => void) | undefined): void {
    this.deviceToPcEndpoint.transfer(64, (error: any, data: Buffer) => {
      callback && callback(data);
    });
  }
  write(data: string | Buffer, callback?: ((error: Error | null) => void) | undefined): this {
    this.emit('data', data);
    this.endpoint.transfer(data, callback);
    return this;
  }
  close(callback?: ((error: Error | null) => void) | undefined, timeout?: number | undefined): this {
    if (!this.device) callback && callback(null);
    try {
      this.device.close();
      usb.removeAllListeners('detach');
      callback && callback(null);
      this.emit('close', this.device);
    }
    catch (err: any) {
      callback && callback(err);
    }
    return this;
  }
}
