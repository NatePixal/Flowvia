{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs_20
    pkgs.pnpm
    pkgs.lsof
    pkgs.procps
  ];
}