const noble = require('noble')

const SERVICE_UUID = 'fff0'
const WRITE_CHARACTERISTIC_UUID = 'fff3'
const NOTIFY_CHARACTERISTIC_UUID = 'fff4'

const GET_TEMPERATURE_COMMAND = 0xd2

const readTemperature = (data, position) => {
  return (data.readUInt16LE(position) - 0x3000) / 20
}

const readRelativeHumidity = (data, position) => {
  return parseInt(data.toString('hex', position, position + 1))
}

class ThermSmartSensor {
  constructor(address=null, log=null) {
    this.log = log || console.log
    this.address = address
    this.peripheral = null
    this.writeCharacteristic = null
    this.notifyCharacteristic = null
    this.temperatureData = null
  }

  isPoweredOn() {
    if (noble.state === 'poweredOn') {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const stateChangeHandler = state => {
        if (state === 'poweredOn') {
          noble.removeListener('stateChange', stateChangeHandler)
          resolve()
        }
      }

      noble.on('stateChange', stateChangeHandler)
      this.log('Waiting for Bluetooth device to power on...')
    })
  }

  scan() {
    return this.isPoweredOn().then(() => {
      if (this.peripheral !== null) {
        return Promise.resolve(this.peripheral)
      }

      return new Promise((resolve, reject) => {
        const discoverHandler = peripheral => {
          if (this.address === null || this.address === peripheral.address) {
            this.peripheral = peripheral
            peripheral.once('disconnect', this.handleDisconnect.bind(this))

            noble.removeListener('discover', discoverHandler)
            noble.removeListener('stateChange', stateChangeHandler)
            noble.stopScanning()

            this.log('Found sensor with address', peripheral.address)
            resolve(peripheral)
          } else {
            this.log('Skipping sensor with address', peripheral.address)
          }
        }

        const stateChangeHandler = state => {
          if (state !== 'poweredOn') {
            noble.removeListener('discover', discoverHandler)
            noble.removeListener('stateChange', stateChangeHandler)
            noble.stopScanning()
            reject('State is no longer poweredOn (' + state + ')')
          }
        }

        noble.startScanning([SERVICE_UUID], true, error => {
          if (error) {
            reject('Failed to scan for sensors: ' + error)
            return
          }

          noble.on('discover', discoverHandler)
          noble.on('stateChange', stateChangeHandler)
          this.log('Scanning for sensors...')
        })
      })
    })
  }

  connect() {
    return this.scan().then(peripheral => {
      if (peripheral.state === 'connected') {
        return Promise.resolve(peripheral)
      }

      return new Promise((resolve, reject) => {
        this.log('Connecting to sensor...')
        peripheral.connect(error => {
          if (error) {
            reject('Failed to connect to sensor: ' + error)
            return
          }

          peripheral.discoverSomeServicesAndCharacteristics(
            [SERVICE_UUID],
            [WRITE_CHARACTERISTIC_UUID, NOTIFY_CHARACTERISTIC_UUID],
            (error2, services, characteristics) => {
              if (error2) {
                reject('Failed to discover services and characteristics: ' + error2)
                return
              }

              characteristics.forEach(characteristic => {
                if (characteristic.uuid === WRITE_CHARACTERISTIC_UUID) {
                  this.writeCharacteristic = characteristic
                } else if (characteristic.uuid === NOTIFY_CHARACTERISTIC_UUID) {
                  this.notifyCharacteristic = characteristic
                }
              })

              this.notifyCharacteristic.subscribe(error3 => {
                if (error3) {
                  reject('Failed to subscribe to characteristic: ' + error3)
                  return
                }

                this.log('Sensor connected')
                resolve(peripheral)
              })
            }
          )
        })
      })
    })
  }

  handleDisconnect() {
    this.log('Sensor was disconnected')
    this.peripheral = null
    this.writeCharacteristic = null
    this.notifyCharacteristic = null
    this.temperatureData = null
  }

  loadTemperatureData() {
    return this.connect().then(() => {
      if (this.temperatureData !== null) {
        return Promise.resolve(this.temperatureData)
      }

      return new Promise((resolve, reject) => {
        const dataHandler = (data, isNotification) => {
          if (isNotification && data.readUInt8(0) === GET_TEMPERATURE_COMMAND) {
            this.temperatureData = data
            this.notifyCharacteristic.removeListener('data', dataHandler)
            this.log('Temperature data loaded')
            resolve(data)
          }
        }

        this.notifyCharacteristic.on('data', dataHandler)

        this.log('Loading temperature data...')
        const command = new Buffer([GET_TEMPERATURE_COMMAND])
        this.writeCharacteristic.write(command, false, error => {
          if (error) {
            this.notifyCharacteristic.removeListener('data', dataHandler)
            reject('Failed to write to characteristic: ' + error)
          }
        })
      })
    })
  }

  getIndoorTemperature() {
    return this.loadTemperatureData().then(data => {
      return readTemperature(data, 3)
    })
  }

  getRelativeHumidity() {
    return this.loadTemperatureData().then(data => {
      return readRelativeHumidity(data, 9)
    })
  }

  getOutdoorTemperature() {
    return this.loadTemperatureData().then(data => {
      return readTemperature(data, 12)
    })
  }
}

module.exports = ThermSmartSensor
