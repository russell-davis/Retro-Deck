import { openSync, readSync, writeSync, closeSync } from 'node:fs'
import { execSync } from 'node:child_process'

const port = process.argv[2] || '/dev/ttyACM0'

execSync(`stty -F ${port} 115200 raw -echo -echoe -echok -echoctl -echoke`)

const fd = openSync(port, 'r+')

writeSync(fd, '\x04')

const buf = Buffer.alloc(4096)
const deadline = Date.now() + 5000
let out = ''

while (Date.now() < deadline) {
  try {
    const n = readSync(fd, buf, 0, buf.length, null)
    if (n > 0) out += buf.subarray(0, n).toString('utf-8')
  } catch {}
}

closeSync(fd)
process.stdout.write(out)
