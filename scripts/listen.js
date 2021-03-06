#!/usr/bin/env node

const colors = require('colors/safe')
const commandLineArgs = require('command-line-args')
const ThermSmart = require('../therm-smart')

const { addresses, help } = commandLineArgs([
  { name: 'addresses', type: String, multiple: true, defaultOption: true },
  { name: 'help', alias: 'h', type: Boolean },
])

if (help) {
  console.log('usage: listen.js [<addresses>]')
  process.exit()
}

const readingHandler = reading => {
  const msg = [
    reading.type,
    ': ',
    colors.green(reading.value),
  ]

  if (reading.sensor) {
    msg.unshift(reading.sensor, '-')
  }

  const symbol = reading.symbol
  if (symbol) {
    msg.push(' ')
    msg.push(colors.green(symbol))
  }

  console.log(msg.join(''))
}

const normAddresses = addresses && addresses.map(
  address => address.toLowerCase().replace(/:/g, '')
)

console.log('Listening for readings...')

ThermSmart.scanForReadings(readingHandler, normAddresses)
  .catch(error => {
    console.error(colors.red('An error occurred:'), error)
    process.exit(1)
  })
