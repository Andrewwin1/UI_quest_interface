"""
Queen Bus RS485 Driver - Python implementation
Протокол связи с Arduino Mega по RS485
"""
import serial
import struct
import time
from typing import Optional, Callable
from threading import Thread, Lock


class QBHeader:
    """Queen Bus packet header (8 bytes)"""
    def __init__(self, sync: bytes, size: int, cycle: int, device_id: int, timeslot: int):
        self.sync = sync  # 'QBR' or 'QBA'
        self.size = size
        self.cycle = cycle
        self.id = device_id
        self.timeslot = timeslot
        self.csum = 0

    def pack(self, data: bytes) -> bytes:
        """Pack header + data into bytes"""
        packet = struct.pack('3sBBBBB',
            self.sync, self.size, self.cycle,
            self.id, self.timeslot, 0
        ) + data[:self.size]
        # Calculate checksum
        csum = sum(packet) & 0xFF
        packet = packet[:-1] + bytes([csum])
        return packet

    @staticmethod
    def unpack(data: bytes) -> Optional['QBHeader']:
        """Unpack header from bytes"""
        if len(data) < 8:
            return None
        sync, size, cycle, dev_id, timeslot, csum = struct.unpack('3sBBBBB', data[:8])
        header = QBHeader(sync, size, cycle, dev_id, timeslot)
        header.csum = csum
        return header


class QUnisenseBuffer:
    """Bitwise data packing/unpacking"""
    def __init__(self, size: int = 32):
        self.data = bytearray(size)
        self.size = size
        self.bitsize = size * 8

    def set_bit(self, bit_offset: int, value: int):
        """Set single bit"""
        if bit_offset >= self.bitsize:
            return
        byte_num = bit_offset >> 3
        bit_in_byte = bit_offset & 7
        if value:
            self.data[byte_num] |= (1 << bit_in_byte)
        else:
            self.data[byte_num] &= ~(1 << bit_in_byte)

    def get_bit(self, bit_offset: int) -> int:
        """Get single bit"""
        if bit_offset >= self.bitsize:
            return 0
        byte_num = bit_offset >> 3
        bit_in_byte = bit_offset & 7
        return 1 if (self.data[byte_num] & (1 << bit_in_byte)) else 0

    def set_bits(self, bit_offset: int, value: int, bit_count: int):
        """Set multiple bits"""
        for i in range(bit_count):
            self.set_bit(bit_offset + i, 1 if (value & (1 << i)) else 0)

    def get_bits(self, bit_offset: int, bit_count: int) -> int:
        """Get multiple bits"""
        result = 0
        for i in range(bit_count):
            if self.get_bit(bit_offset + i):
                result |= (1 << i)
        return result


class QueenBusDevice:
    """Queen Bus Master - communication with Arduino Mega"""

    def __init__(self, port: str = '/dev/serial0', baudrate: int = 115200, device_id: int = 16):
        self.port = port
        self.baudrate = baudrate
        self.device_id = device_id
        self.timeslot = 3  # ms
        self.cycle = 0

        self.serial: Optional[serial.Serial] = None
        self.lock = Lock()
        self.connected = False

        # Device state (15 channels each)
        self.outputs = [0] * 15  # Digital outputs
        self.pwm_power = [0] * 15  # PWM power (0-255)
        self.pwm_strobo = [0] * 15  # PWM strobo mode (0-2)
        self.inputs = [0] * 15  # Digital inputs
        self.analog = [0] * 15  # Analog inputs (0-1023)

        self.running = False
        self.thread: Optional[Thread] = None
        self.on_input_change: Optional[Callable] = None

    def connect(self) -> bool:
        """Connect to RS485 device"""
        try:
            self.serial = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=0.1,
                write_timeout=0.1
            )
            self.connected = True
            print(f"Connected to {self.port} at {self.baudrate} baud")
            return True
        except Exception as e:
            print(f"Connection error: {e}")
            self.connected = False
            return False

    def disconnect(self):
        """Disconnect from device"""
        self.stop()
        if self.serial and self.serial.is_open:
            self.serial.close()
        self.connected = False

    def send_command(self) -> bool:
        """Send command to device"""
        if not self.connected or not self.serial:
            return False

        with self.lock:
            try:
                # Prepare data buffer
                buf = QUnisenseBuffer(32)

                # Pack outputs (bits 0-14)
                for i in range(15):
                    buf.set_bit(i, self.outputs[i])

                # Pack PWM (bits 15-164, 10 bits per channel)
                for i in range(15):
                    value = self.pwm_power[i] | (self.pwm_strobo[i] << 8)
                    buf.set_bits(15 + i * 10, value, 10)

                # Create packet
                header = QBHeader(b'QBR', 32, self.cycle, self.device_id, self.timeslot)
                packet = header.pack(bytes(buf.data))

                # Send packet
                self.serial.write(packet)
                self.serial.flush()

                # Wait for response
                time.sleep(self.timeslot / 1000.0)

                # Read response
                response = self.serial.read(8 + 32)
                if len(response) >= 8:
                    resp_header = QBHeader.unpack(response)
                    if resp_header and resp_header.sync == b'QBA':
                        # Parse response data
                        resp_buf = QUnisenseBuffer(32)
                        resp_buf.data = bytearray(response[8:40])

                        # Read inputs (bits 0-14)
                        old_inputs = self.inputs.copy()
                        for i in range(15):
                            self.inputs[i] = resp_buf.get_bit(i)

                        # Read analog (bits 15-164, 10 bits per channel)
                        for i in range(15):
                            self.analog[i] = resp_buf.get_bits(15 + i * 10, 10)

                        # Trigger callback on input change
                        if self.on_input_change and old_inputs != self.inputs:
                            self.on_input_change(self.inputs)

                        self.cycle = (self.cycle + 1) & 0xFF
                        return True

                return False

            except Exception as e:
                print(f"Communication error: {e}")
                return False

    def start_polling(self, interval: float = 0.1):
        """Start polling thread"""
        if self.running:
            return

        self.running = True
        self.thread = Thread(target=self._poll_loop, args=(interval,), daemon=True)
        self.thread.start()

    def stop(self):
        """Stop polling thread"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=1.0)

    def _poll_loop(self, interval: float):
        """Polling loop"""
        while self.running:
            self.send_command()
            time.sleep(interval)

    # Convenience methods
    def set_output(self, pin: int, state: int):
        """Set digital output"""
        if 0 <= pin < 15:
            self.outputs[pin] = 1 if state else 0

    def set_pwm(self, pin: int, power: int, strobo: int = 0):
        """Set PWM output"""
        if 0 <= pin < 15:
            self.pwm_power[pin] = max(0, min(255, power))
            self.pwm_strobo[pin] = max(0, min(2, strobo))

    def get_input(self, pin: int) -> int:
        """Get digital input"""
        if 0 <= pin < 15:
            return self.inputs[pin]
        return 0

    def get_analog(self, pin: int) -> int:
        """Get analog input"""
        if 0 <= pin < 15:
            return self.analog[pin]
        return 0
