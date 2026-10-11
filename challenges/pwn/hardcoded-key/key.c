/* Reverse-engineering sample: the flag is assembled at runtime from an XOR'd
 * table so it is not visible to `strings`, teaching static analysis of data
 * and control flow. Compile with the provided Makefile. Synthetic flag. */
#include <stdio.h>
#include <string.h>

/* "CQ{h4rdc0ded_x0r_1s_n0t_s3cret}" XOR 0x5A, laid out as a byte table. */
static const unsigned char tbl[] = {
  0x19,0x0b,0x21,0x32,0x6e,0x28,0x3e,0x39,0x6a,0x3e,0x3f,0x3e,0x05,0x22,0x6a,
  0x28,0x05,0x6b,0x29,0x05,0x34,0x6a,0x2e,0x05,0x29,0x69,0x39,0x28,0x3f,0x2e,
  0x27
};

static void reveal(char *out) {
  size_t n = sizeof(tbl);
  for (size_t i = 0; i < n; i++) out[i] = tbl[i] ^ 0x5A;
  out[n] = '\0';
}

int main(int argc, char **argv) {
  char flag[64];
  reveal(flag);
  if (argc == 2 && strcmp(argv[1], "--reveal") == 0) {
    puts(flag);
    return 0;
  }
  char guess[64] = {0};
  printf("Enter the recovered key: ");
  if (!fgets(guess, sizeof(guess), stdin)) return 1;
  guess[strcspn(guess, "\n")] = '\0';
  if (strcmp(guess, flag) == 0) puts("Correct! Submit the key as the flag.");
  else puts("Nope. Analyse the binary's data section and XOR routine.");
  return 0;
}
