#ifndef _QUEEN_UNIHEAD_
#define _QUEEN_UNIHEAD_

#if defined ( WIN32 ) || defined ( POSIX )
	// OS detected
	#include <sl_stream.h>
	#define OS_FOUND
	#define	HIGH				1
	#define	LOW				0
	#define	OUTPUT			0
	#define	INPUT				1
	#define	INPUT_PULLUP	2
	#define	A0					0
	#define	A1					1
	#define	A2					2
	#define	A3					3
	#define	A4					4
	#define	A5					5
	#define	A6					6
	#define	A7					7
	DWORD		millis( );
	DWORD		micros( );
	void		pinMode( int pin, int mode );
	void		digitalWrite( int pin, int state );
	int		digitalRead( int pin );
	void		delay( int value );
	struct DSerial
	{
		DStream *		stream;
		IObuf				buf;
		CONSTRUCTOR		DSerial( );
		void				begin( int baud );
		void				print( char * str );
		void				print( int val );
		void				println( char * str );
		void				println( int val );
		void				write( void * ptr, int sz );
		bool				available( );
		BYTE				read( );
	};
	typedef DSerial	HardwareSerial;
	extern DSerial		Serial;
#else
	// microcontroller ( temp )
	#include <Arduino.h>
	#define ARDUINO_FOUND
	typedef	unsigned char	BYTE;
	typedef	unsigned int	WORD;
	typedef	unsigned long	DWORD;
	#define	NO					0
	#define	IS					1
	#define	MUST				2
	#define	CONSTRUCTOR
#endif

// time interval definition
#define time_interval(past,now) ( now >= past ? now - past : 0xFFFFFFFF - past + now )

// maximum data size
// version 1 : raw
#define MAX_UNI_SIZE			32
// version 2 : pcb
#define MAX_UNIv2_R2USIZE	18
#define MAX_UNIv2_U2RSIZE	14
// version 3 : dmx
#define MAX_UNI_DMXSIZE		255

#ifdef WIN32
#pragma pack(push)
#pragma pack(1)
#endif
// Queen Bus Header ( 8 bytes )
struct QB_Header
{
	char				sync[ 3 ];			// always 'QBR' for master, 'QBA' for device
	BYTE				size;					// data size
	BYTE				cycle;				// cycle 0 - 255
	BYTE				id;					// abonent rs485 id, this defines time slot: up to 32 abonents
	BYTE				timeslot;			// timeslot, ms
	BYTE				csum;					// control summ
	// estimates control summ; csum must be zero before call calc_csum routine
	BYTE				calc_csum( )
	{
		BYTE * buf = ( BYTE * ) this, summ = 0;
		int dsz = sizeof( QB_Header ) + size;
		for ( int i = 0; i < dsz; i ++ ) summ += buf[ i ];
		return ( summ );
	}	
};
#ifdef WIN32
#pragma pack(pop)
#endif

struct QUnisenseBuffer
{
	BYTE *			data;
	DWORD				size;
	DWORD				bitsize;
	CONSTRUCTOR		QUnisenseBuffer( void * ptr = 0, DWORD sz = 0 )
	{
		data = ( BYTE * ) ptr;
		size = sz;
		bitsize = size * 8;
	}
	inline void		set_bit( DWORD bit_offset, DWORD value )
	{
		if ( bit_offset >= bitsize ) return;
		DWORD byte_number = bit_offset >> 3;		// the same as / 8
		DWORD bit_in_byte = bit_offset & 7;			// the same as % 8
		if ( value ) data[ byte_number ] |= ( ( DWORD ) 1 << bit_in_byte );
		else data[ byte_number ] &= ~( ( DWORD ) 1 << bit_in_byte );

	}
	inline DWORD	get_bit( DWORD bit_offset )
	{
		if ( bit_offset >= bitsize ) return 0;
		DWORD byte_number = bit_offset >> 3;		// the same as / 8
		DWORD bit_in_byte = bit_offset & 7;			// the same as % 8
		return ( data[ byte_number ] & ( ( DWORD ) 1 << bit_in_byte ) ) ? 1 : 0;

	}
	inline void	set_bits( DWORD bit_offset, DWORD value, DWORD valsz )
	{
		for ( DWORD i = 0; i < valsz; i ++ )
		{
			set_bit( bit_offset + i, ( value & ( ( DWORD ) 1 << i ) ) ? 1 : 0 );
		}

	}
	inline DWORD	get_bits( DWORD bit_offset, DWORD valsz )
	{
		DWORD result = 0;
		for ( DWORD i = 0; i < valsz; i ++ )
		{
			result |= ( ( get_bit( bit_offset + i ) ) << i );
		}
		return ( result );
	}
	void			logdata( )
	{
		#ifdef WIN32
		DFile f( "QUnisenseBuffer.debug", FA_WRITE );
		static bool filecreated = false;
		if ( ! filecreated )
		{
			filecreated = true;
			if ( f.Create( ) )
			{
				f.Goto( FP_END );
				char buf[ 0x10 ], str[ 0x100 + 0x10 ];
				str[ 0 ] = 0;
				for ( DWORD i = 0; i < size * 8; i ++ )
				{
					strcat( str, itoa( i % 10, buf, 10 ) ); 
				}
				f.WriteLine( str );
				f.Close( );
			}			
		}
		if ( ! f.Open( ) ) return;
		f.Goto( FP_END );
		char str[ 0x100 + 0x10 ];
		str[ 0 ] = 0;
		for ( DWORD byte_number = 0; byte_number < size; byte_number ++ )
		{
			for ( DWORD bit = 0; bit < 8; bit ++ )
			{
				if ( data[ byte_number ] & ( 1 << bit ) ) strcat( str, "1" );
				else strcat( str, "0" );
			}
		}
		f.WriteLine( str );
		f.Close( );
		#else
		Serial.println( "\n" );
		for ( DWORD byte_number = 0; byte_number < size; byte_number ++ )
		{
			for ( DWORD bit = 0; bit < 8; bit ++ )
			{
				if ( data[ byte_number ] & ( 1 << bit ) ) Serial.print( "1" );
				else Serial.print( "0" );
			}
		}
		Serial.println( "\n" );
		#endif
	}
};

#endif // _QUEEN_UNIHEAD_

