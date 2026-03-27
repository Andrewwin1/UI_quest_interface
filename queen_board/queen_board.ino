#include "queen_bus.h"
#include "queen_unidev.h"


#define  RS485TX_PIN   53

DWORD now = 0;
int busId = 16;
const int pinsMax = 15;

// pwm
const int pwm[ pinsMax ] = {  2,  3,  4,  5,  6,  7,  8,  9, 10,  11,  12,  13,  44,  45,  46 };
BYTE pwm_power[ pinsMax ] = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
BYTE pwm_strobo[ pinsMax ] = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
DWORD strobo_time;
int strobo_counter = 0;
BYTE ms12_state = LOW;
BYTE ms25_state = LOW;
BYTE ms50_state = LOW;
// analog in
const int out[ pinsMax ] = { 49, 48, 47, 43, 42, 41, 40, 39, 38,  37,  36,  35,  34,  33,  32 };
// digital in
const int din[ pinsMax ] = { 31, 30, 29, 28, 27, 26, 25, 24, 23,  20,  19,  18,  22,  A0,  21 };
int din_change[ pinsMax ] = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
int din_state[ pinsMax ] = { HIGH, HIGH, HIGH, HIGH, HIGH, HIGH, HIGH, HIGH, HIGH, HIGH, HIGH, HIGH, HIGH, HIGH, HIGH };
// analog in
const int ain[ pinsMax ] = { A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A12, A13, A14, A15 };

class QQueenDevice : public IQueenBus
{
public:
  CONSTRUCTOR   QQueenDevice( ) : IQueenBus ( )
  {
  }
private:
	void        on_receive( QB_Header * head )
	{
  		QUnisenseBuffer ub( head + 1, MAX_UNI_SIZE );
		BYTE * data = ( BYTE * ) ( head + 1 );
		// set out states 
		for ( int i = 0; i < pinsMax; i ++ )
		{
			digitalWrite( out[i], ub.get_bit( i ) ? HIGH : LOW );
		}
		// set pwm states 
		for ( int i = 0; i < pinsMax; i ++ )
		{
			DWORD state = ub.get_bits( 15 + i * 10, 10 );
			pwm_power[ i ] = state & 0xFF;
			pwm_strobo[ i ] = state >> 8;
			if ( pwm_strobo[ i ] == 0 ) analogWrite( pwm[i], pwm_power[ i ] );
		}		
	}
	BYTE        on_answer( QB_Header * head )
	{
		QUnisenseBuffer ub( head + 1, MAX_UNI_SIZE );
		// send dins states
		for ( int i = 0; i < pinsMax; i++ )
		{
			ub.set_bit( i, din_state[ i ] == LOW ? 1 : 0 );
		}
		// send ains states
		for ( int i = 0; i < pinsMax; i++ )
		{
			ub.set_bits( 15 + i * 10, analogRead( ain[ i ] ), 10 );
		}
		return MAX_UNI_SIZE;
	}
};

QQueenDevice device;

// init routine
void setup( )
{
	// init pins
	for ( int i = 0; i < pinsMax; i ++ )
	{
		pinMode( pwm[ i ], OUTPUT );
		pinMode( out[ i ], OUTPUT );
		pinMode( din[ i ], INPUT_PULLUP );
		pinMode( ain[ i ], INPUT );
	}	
	// setup unisense interface
	device.init( & Serial2 );
	device.configure( RS485TX_PIN, busId, 3 );  
}

// cycle routine
void loop( )
{
	now = millis( );
	device.control( );
	// handle stroboscope and bounce
	if ( time_interval( strobo_time, now ) >= 12 )
	{
		// handle 12 ms timeout
		strobo_time = now;
		strobo_counter ++;
		if ( strobo_counter > 3 ) strobo_counter = 0;
		// ms12_state changes state each 12ms
		if ( ms12_state == LOW ) ms12_state = HIGH; else ms12_state = LOW;
		// ms25_state changes state each second cycle
		if ( strobo_counter == 0 || strobo_counter == 2 )
		if ( ms25_state == LOW ) ms25_state = HIGH; else ms25_state = LOW;
		// make stroboscope
		for ( int i = 0; i < pinsMax; i ++ )
		{
			if ( pwm_strobo[ i ] == 0 ) continue;
			switch ( pwm_strobo[ i ] )
			{
				case 0x01:
				if ( ms25_state == HIGH ) analogWrite( pwm[ i ], pwm_power[ i ] );
				else analogWrite( pwm[ i ], 0 );
				break;
				case 0x02:
				if ( ms12_state == HIGH ) analogWrite( pwm[ i ], pwm_power[ i ] );
				else analogWrite( pwm[ i ], 0 );
				break;
			}
		}
		// bounce control
		for ( int i = 0; i < pinsMax; i ++ )
		{
			int state = digitalRead( din[ i ] );
      if (state != din_state[ i ] && din_change[ i ] == 0)
      {
        din_state[ i ] = state;
        din_change[ i ] = 17;
      }
      if (din_change[ i ] > 0) din_change[ i ] --;
//			if ( state == din_state[ i ] ) din_change[ i ] = 0;
//			else
//			{
//				din_change[ i ] ++;
//				if ( din_change[ i ] > 3 ) din_state[ i ] = state;
//			}
		}
	}  
}
