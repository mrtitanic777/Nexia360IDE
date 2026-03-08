/*
 * nxcompress.h — Nexia Compression Wrapper
 *
 * Uses Windows NTDLL RtlCompressBuffer / RtlDecompressBuffer (LZNT1).
 * Available on Windows XP through Windows 11. Zero external dependencies.
 *
 * Provides zlib-compatible function signatures:
 *   compress2(dest, destLen, source, sourceLen, level)
 *   uncompress(dest, destLen, source, sourceLen)
 *   compressBound(sourceLen)
 *
 * LZNT1 typically achieves 40-60% compression on mixed binary/text data.
 */

#ifndef NXCOMPRESS_H
#define NXCOMPRESS_H

#include <windows.h>

/* zlib-compatible return codes */
#define Z_OK            0
#define Z_MEM_ERROR    (-4)
#define Z_BUF_ERROR    (-5)
#define Z_DATA_ERROR   (-3)

/* Types matching zlib */
typedef unsigned long uLong;
typedef unsigned long uLongf;

/* NTDLL compression format */
#define NX_COMPRESSION_FORMAT_LZNT1  0x0002
#define NX_COMPRESSION_ENGINE_STD    0x0000
#define NX_COMPRESSION_ENGINE_MAX    0x0100

/* NTDLL function prototypes (loaded dynamically to avoid link-time deps) */
typedef LONG (NTAPI *pfnRtlCompressBuffer)(
    USHORT CompressionFormat,
    PUCHAR UncompressedBuffer,
    ULONG  UncompressedBufferSize,
    PUCHAR CompressedBuffer,
    ULONG  CompressedBufferSize,
    ULONG  UncompressedChunkSize,
    PULONG FinalCompressedSize,
    PVOID  WorkSpace
);

typedef LONG (NTAPI *pfnRtlDecompressBuffer)(
    USHORT CompressionFormat,
    PUCHAR UncompressedBuffer,
    ULONG  UncompressedBufferSize,
    PUCHAR CompressedBuffer,
    ULONG  CompressedBufferSize,
    PULONG FinalUncompressedSize
);

typedef LONG (NTAPI *pfnRtlGetCompressionWorkSpaceSize)(
    USHORT CompressionFormat,
    PULONG CompressBufferWorkSpaceSize,
    PULONG CompressFragmentWorkSpaceSize
);

/* ── Internal: lazily resolve NTDLL functions ── */
static pfnRtlCompressBuffer             s_pCompress   = NULL;
static pfnRtlDecompressBuffer           s_pDecompress = NULL;
static pfnRtlGetCompressionWorkSpaceSize s_pGetWSSize = NULL;
static BOOL s_ntdllResolved = FALSE;

static void sResolveNtdll(void)
{
    if (s_ntdllResolved) return;
    HMODULE hNtdll = GetModuleHandleA("ntdll.dll");
    if (hNtdll) {
        s_pCompress   = (pfnRtlCompressBuffer)GetProcAddress(hNtdll, "RtlCompressBuffer");
        s_pDecompress = (pfnRtlDecompressBuffer)GetProcAddress(hNtdll, "RtlDecompressBuffer");
        s_pGetWSSize  = (pfnRtlGetCompressionWorkSpaceSize)GetProcAddress(hNtdll, "RtlGetCompressionWorkSpaceSize");
    }
    s_ntdllResolved = TRUE;
}

/* ── compressBound: worst-case output size ── */
static __inline uLong compressBound(uLong sourceLen)
{
    /* LZNT1 worst case: input + ~12.5% overhead + header per 4KB chunk */
    return sourceLen + (sourceLen / 8) + 4096;
}

/* ── compress2: compress data (level is ignored, LZNT1 has fixed algorithm) ── */
static __inline int compress2(
    unsigned char *dest, uLongf *destLen,
    const unsigned char *source, uLong sourceLen,
    int level)
{
    (void)level;
    sResolveNtdll();
    if (!s_pCompress || !s_pGetWSSize) return Z_MEM_ERROR;

    /* Get workspace size */
    ULONG wsSize = 0, fragSize = 0;
    USHORT fmt = NX_COMPRESSION_FORMAT_LZNT1 | NX_COMPRESSION_ENGINE_MAX;
    LONG status = s_pGetWSSize(fmt, &wsSize, &fragSize);
    if (status != 0) return Z_MEM_ERROR;

    /* Allocate workspace */
    PVOID workspace = HeapAlloc(GetProcessHeap(), 0, wsSize);
    if (!workspace) return Z_MEM_ERROR;

    /* Compress */
    ULONG finalSize = 0;
    status = s_pCompress(
        fmt,
        (PUCHAR)source, (ULONG)sourceLen,
        (PUCHAR)dest, (ULONG)*destLen,
        4096,       /* chunk size */
        &finalSize,
        workspace
    );

    HeapFree(GetProcessHeap(), 0, workspace);

    if (status != 0) return Z_BUF_ERROR;

    *destLen = (uLongf)finalSize;
    return Z_OK;
}

/* ── uncompress: decompress data ── */
static __inline int uncompress(
    unsigned char *dest, uLongf *destLen,
    const unsigned char *source, uLong sourceLen)
{
    sResolveNtdll();
    if (!s_pDecompress) return Z_MEM_ERROR;

    ULONG finalSize = 0;
    LONG status = s_pDecompress(
        NX_COMPRESSION_FORMAT_LZNT1,
        (PUCHAR)dest, (ULONG)*destLen,
        (PUCHAR)source, (ULONG)sourceLen,
        &finalSize
    );

    if (status != 0) return Z_DATA_ERROR;

    *destLen = (uLongf)finalSize;
    return Z_OK;
}

#endif /* NXCOMPRESS_H */
