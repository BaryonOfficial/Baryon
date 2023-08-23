// Example: Explaining Code









/* Simply, ask the chat (Cmd+L/Ctrl+L) what this code does. */







#include <stdio.h>
#include <unistd.h> 
#include <stdlib.h>

typedef struct block_metadata {
   struct block_metadata *prev;
   struct block_metadata *next;
   size_t size;
} block;

block *head = NULL;

#ifndef ALLOC_UNIT
#define ALLOC_UNIT 3*sysconf( _SC_PAGESIZE )
#endif

#ifndef MIN_DEALLOC
#define MIN_DEALLOC 1 * sysconf(_SC_PAGESIZE)
#endif

#define BLOCK_MEM( ptr ) ( void * )( (unsigned long)ptr + sizeof( block ) )
#define BLOCK_HEADER( ptr ) ( void * )( (unsigned long)ptr - sizeof( block ) )

void stats( char * stage ) {
   printf( "Program break at %s : %ld \n", stage, sbrk( 0 ) );

   block *ptr = head;
   while( ptr ) {
      printf( "block addr: %ld, size: %ld \n", ptr, ptr->size );
      ptr = ptr->next;
   }
}

block * splitBlock( block *b, size_t size ) {
   block *newBlock;
   newBlock = (block *) ( (unsigned long)b + sizeof( block ) + size );
   newBlock->size = b->size - ( sizeof( block ) + size );
   b->size = size;
   return newBlock;
}

void addToFreeList( block *freeBlock ) {
   printf( "Adding %ld with size %ld to free list \n", freeBlock,
           freeBlock->size );
   freeBlock->next = NULL;
   freeBlock->prev = NULL;
   if( !head || (unsigned long) head >= (unsigned long) freeBlock ) {
      if( head ) {
         head->prev = freeBlock;
      }
      freeBlock->next = head;
      head = freeBlock;
      return;
   }

   block *ptr = head;
   while( ptr->next && (unsigned long) ptr->next < (unsigned long) freeBlock ) {
      ptr = ptr->next;
   }
   freeBlock->next = ptr->next;
   freeBlock->prev = ptr;
   ( ptr->next )->prev = freeBlock;
   ptr->next = freeBlock;
   return;
}

void removeFromFreeList( block * b ) {
   if( !b->prev ) {
      if( b->next ) {
         head = b->next;
      } else {
         head = NULL;
      }
   } else {
      b->prev->next = b->next;
   }
   if( b->next ) {  
      b->next->prev = b->prev;
   }
}

void * _malloc( size_t size ) {
   block *ptr = head;
   while( ptr ) {
      if( ptr->size >= size ) {
         removeFromFreeList( ptr );
         if( ptr->size == size ) {
            return BLOCK_MEM( ptr );
         }
         block *newBlock = splitBlock( ptr, size );
         addToFreeList( newBlock );
         return BLOCK_MEM( ptr );
      }
      ptr = ptr->next;
   }

   size_t alloc_size;
   if( size >= ALLOC_UNIT ) {
      alloc_size = size + sizeof( block );
   } else {
      alloc_size = ALLOC_UNIT;
   }

   ptr = sbrk( alloc_size );
   if( !ptr ) {
      printf( "Failed to alloc %d \n", alloc_size );
   }
   ptr->prev = NULL;
   ptr->next = NULL;
   ptr->size = alloc_size - sizeof( block );

   if( alloc_size > size + sizeof( block ) ){
      block *newBlock = splitBlock( ptr, size );
      addToFreeList( newBlock );
   }
   return BLOCK_MEM( ptr );
}

void scanAndCoalesce() {
   block *curr = head;
   unsigned long curr_addr, next_addr;
   while( curr->next ) {
      curr_addr = ( unsigned long ) curr;
      next_addr = ( unsigned long ) curr->next;
      if( curr_addr + sizeof( block ) + curr->size == next_addr ) {
         curr->size += curr->next->size + sizeof( block );
         curr->next = curr->next->next;
         if( curr->next->next ) {
            curr->next->next->prev = curr;
         } else {
            break;
         }
      }
      curr = curr->next;
   }
   stats( "after merge" );
   unsigned long program_break = (unsigned long) sbrk(0);
   if( program_break == 0 ) {
      printf( "failed to retrive program break\n" );
      return;
   }
   curr_addr = ( unsigned long ) curr;
   if( curr_addr + curr->size + sizeof( block ) == program_break
       && curr->size >= MIN_DEALLOC ) {
      removeFromFreeList( curr );
      if( brk( curr ) != 0 ) {
         printf( "error freeing memory \n" );
      }
   }
}

void _free( void * addr ) {
   block *block_addr = BLOCK_HEADER( addr );
   addToFreeList( block_addr );
   stats( "before coalesing " );
   scanAndCoalesce();
}

void cleanup() {
   printf( "Cleaning up memory ...\n" );
   if( head != NULL ) {
      if( brk( head ) != 0 ) {
         printf( "Failed to cleanup memory" );
      }
   }
   head = NULL;
}

int main() {
   atexit( cleanup );

   printf( "Malloc implementation\n" );

   stats( "beginning" );
   int *p1 =_malloc( 64 );
   stats( "after allocating 64 bytes" );
   int *p2 = _malloc( 1 );
   _free( p1 );
   return 0;
}