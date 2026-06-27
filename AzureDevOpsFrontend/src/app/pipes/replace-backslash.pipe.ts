import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'replaceBackslash',
  standalone: true
})
export class ReplaceBackslashPipe implements PipeTransform {
  transform(value: string, replacement: string = '/'): string {
    return value ? value.replace(/\\\\/g, replacement) : value;
  }
}
