#ifndef _QUEEN_UNIDEV_
#define _QUEEN_UNIDEV_

#include "queen_unihead.h"

// #####################################################
// #####################################################
// ##                                                 ##
// ##                   discrete in                   ##
// ##                                                 ##
// #####################################################
// #####################################################

// queen din base class
struct QQueenDin
{
	int			pin;
	int			state;
	int			changed;
	int			defstate;
	void			init( int pin_index, int pull = HIGH );
	void			control( );
	inline bool	signal( )
	{
		return state == defstate ? false : true;
	}
	inline void	reset( )
	{
		state = defstate;
		changed = 0;
	}
};

// #####################################################
// #####################################################
// ##                                                 ##
// ##                     keyboard                    ##
// ##                                                 ##
// #####################################################
// #####################################################

struct QQueenKb4x4
{
	struct MU
	{
	  char    	key;        // predefined key value
	  int     	state;      // current state 
	  int     	count;      // count stable state
	};	
	MU      		mu[ 4 ][ 4 ];
	int	    	pin_in[ 4 ];
	int			pin_out[ 4 ];
	int			group;
	DWORD			tmgroup;
	int			default_state;
	int			signal_state;
	char			key;
	// init routine : must be called in setup( )
	void			init( int out1, int out2, int out3, int out4, int in1, int in2, int in3, int in4, int pull );
	// control routine : must be called in loop( )
	void			control( DWORD & now );
	// press button callback
	virtual void on_press( char key );
	// release button callback
	virtual void on_release( );
};

// #####################################################
// #####################################################
// ##                                                 ##
// ##                infra red receiver               ##
// ##                                                 ##
// #####################################################
// #####################################################

/*
#include <IRremote.h>
struct QQueenIR
{
	IRrecv *		ir;
	DWORD			value;
	DWORD			tmval;
	// init routine : must be called in setup( )
	void			init( int pin );
	// control routine : must be called in loop( )
	DWORD			control( DWORD & now );
};
*/

// #####################################################
// #####################################################
// ##                                                 ##
// ##                       RFID                      ##
// ##                                                 ##
// #####################################################
// #####################################################
/*
// MFRC522
#include <SPI.h>
#include <MFRC522.h>
struct QQueenRfidMFRC522
{
	MFRC522 		mfrc522;
	BYTE			byte_result[ 4 ];
	DWORD			dword_result;
	DWORD			tmrfid;
	CONSTRUCTOR	QQueenRfidMFRC522( );
	DWORD			control( bool logserial = false );
	void			control_timeout( DWORD timeout = 300 );
	void			reset( );
};
*/

/*
// RDM6300
#include <SoftwareSerial.h>
struct RDM6300
{
	DWORD				data;
	int				count;
	DWORD				tmbyte;
	bool				id_ready;
	DWORD				id_time;
	DWORD				id_dword;
	SoftwareSerial * soft;
	HardwareSerial * hard;
	BYTE				serialtype;
	CONSTRUCTOR		RDM6300( HardwareSerial * serial, int rxpin = -1, int txpin = -1 );
	void				reset( );
	void				control( DWORD now, bool logserial = false );
};
*/

#endif //_QUEEN_UNIDEV_

