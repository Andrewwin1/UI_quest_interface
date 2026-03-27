#ifndef _QUEEN_BUS_
#define _QUEEN_BUS_
// this class is used as a base class for any unisense device

#include "queen_unihead.h"
#define CONST_BYTE static const BYTE

// queen Bus base class
class IQueenBus
{
private:
	CONST_BYTE		DATA_SIZE		= 100;
	CONST_BYTE		modeNone			= NO;
	// constants for syncro bytes
	CONST_BYTE		waitStartR		= modeNone;
	CONST_BYTE		waitStartS		= 1;
	CONST_BYTE		waitStart4		= 2;
	CONST_BYTE		waitStart8		= 3;
	CONST_BYTE		waitStart5		= 4;
	// constants for syncro bytes
	CONST_BYTE		waitFrameQ		= modeNone;
	CONST_BYTE		waitFrameB		= 11;
	CONST_BYTE		waitFrameR		= 12;
	CONST_BYTE		waitFrameHead	= 13;
	CONST_BYTE		waitFrameData	= 14;
	// answer time stamp
	CONST_BYTE		waitStampA		= modeNone;
	CONST_BYTE		waitStampN		= 21;
	CONST_BYTE		waitStampS		= 22;
	CONST_BYTE		waitStampW		= 23;
	CONST_BYTE		waitStampE		= 24;
	CONST_BYTE		waitStampR		= 25;
	// static members ( are defined by current firmware )
	BYTE				id;				// id on the bus ( time slot )
	BYTE				tx;				// rs485 transmitter pin
	BYTE				deftimeslot;	// time slot
	BYTE				timeslot;		// time slot
	HardwareSerial * serial;
	DWORD baudrate;						// serial speed
	// receiving mode, flags and times
	bool				connect_flag;	// true when connected
	DWORD				now;				// current time
	DWORD				tmlastbyte;		// time of last received byte
	int				mode;				// current receive mode ( see above )
	bool				start_flag;		// becomes 'true' when "RS485" is received
	DWORD				tmstart;			// time of start_flag
	bool				frame_flag;		// becomes 'true' when own package is received
	DWORD				tmframe;			// time of frame_flag
	bool				stamp_flag;		// becomes 'true' when time stamp is received
	DWORD				tmstamp;			// time of stamp_flag
	// estimating parameters
	DWORD				tmrecv;			// time of last received byte
	DWORD				tmsync;			// time of received synchropacket
	int				sz;				// received data size in waitData mode
	int				wait_size;		// full packet size received from master
	BYTE				data[ DATA_SIZE ];	// data buffer
	// answer mechanism
	BYTE				cycle;			// current cycle received from master
	BYTE				answer[ 64 ];	// answer buffer
	int				answer_sz;		// answer size
	DWORD				answer_time;	// answer time interval
	// resets buffer
	void 				reset( );
	// estimates control summ
	BYTE 				calc_csum( QB_Header * head );
	// handle new received byte
	void 				put( BYTE newbyte );
	// incoming and outcoming processing
	void				get_start( );
	void				get_frame( );
	void				get_stamp( );
	void				prepare_answer( );
	void				transmit_answer( );
protected:
	// connect and disconnect events
	virtual void	on_connect( ) { }
	virtual void	on_disconnect( ) { }
	// get incoming buffer pointer if data is ready
	virtual void 	on_receive( QB_Header * head ) = 0;
	// sends answer for the control program
	virtual BYTE	on_answer( QB_Header * head ) = 0;
	// event right after the answer is sent
	virtual void	on_answer_sent( ) { }
public:
	// initializing routines
	CONSTRUCTOR		IQueenBus( );
	void				init( HardwareSerial * serial = & Serial, DWORD baudrate = 115200 );
	void				configure( BYTE txpin, BYTE id, BYTE timeslot = 7 );
	bool				connected( );
	// control routine ( thread procedure or loop call )
	void 				control( );
};

#endif //_QUEEN_BUS_

/*
// it is simple to use it...
#include <queen_bus.h>

class QQueenDevice : public IQueenBus
{
public:
	CONSTRUCTOR   QQueenDevice( ) : IQueenBus ( )
	{
	}
private:
	void        on_receive( QB_Header * head )
	{
		QUnisenseBuffer * ub = ( QUnisenseBuffer * ) ( head + 1 );
		// examples : how to get data from buffer
		bool bool_value = ub->get_bit( 0 );			// get first bit as boolean
		int int_value = ub->get_bits( 16, 16 );	// integer packed in 15-31 bits
	}
	BYTE        on_answer( QB_Header * head )
	{
		QUnisenseBuffer * ub = ( QUnisenseBuffer * ) ( head + 1 );
		// examples : how to put data to buffer
		bool bool_value = true;
		int int_value = 0x0F4D;
		ub->set_bit( 0, bool_value ? 1 : 0 );		// put boolean to the first bit
		ub->set_bits( 16, int_value, 16 );			// pack integer into 15-31 bits
		return ( MAX_UNI_SIZE );
	}
};

#define	RS485TX_PIN 	2
#define	BUSID       	1
QQueenDevice device;

// init routine
void setup( )
{
  device.init( );
  device.configure( RS485TX_PIN, BUSID );
}

// cycle routine
void loop( )
{
  device.control( );
}
*/
