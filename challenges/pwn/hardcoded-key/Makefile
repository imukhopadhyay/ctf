# Build a non-stripped and a stripped ELF for the reverse-engineering challenge.
CC ?= gcc
CFLAGS ?= -O0 -fno-stack-protector -no-pie
all: hardcoded-key hardcoded-key-stripped
hardcoded-key: key.c
	$(CC) $(CFLAGS) -o $@ key.c
hardcoded-key-stripped: hardcoded-key
	cp hardcoded-key $@ && strip $@
clean:
	rm -f hardcoded-key hardcoded-key-stripped
