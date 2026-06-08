const arr = new Object();
arr.length = () => Object.keys(arr).length; // Initialize length to 0
arr[0] = 'a';
arr[1] = 'b';
arr[2] = 'c';
Object.defineProperty(arr, 'length', {
  value: arr.length(),
  writable: false,
  enumerable: false,
  configurable: false
});
arr[3] = 'd'; // This will not change the length property


const obj = []
obj["a"] = 'a';
obj["b"] = 'b';
obj["c"] = 'c';
obj[30] = 'd';
obj["length"] = 10

console.log(obj)
console.log(obj.length)
console.log(obj["length"]); 