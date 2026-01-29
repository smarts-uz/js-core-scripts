import { execSync } from 'child_process';
import fs from 'fs';


export class ES {

    static find(name, instance = "One") {

        // es.exe -instance "One" -regex "^Arty 3D Viewer$" -hide-empty-search-results -sort-descending -sort date-modified -whole-words -case -highlight -no-digit-grouping /ad

        // Create the command
        const command = `es.exe -instance "${instance}"  -regex "^${name}$" -hide-empty-search-results -sort-descending -sort date-modified -whole-words -case -highlight -no-digit-grouping /ad`;

        return this.execute(command)

    }



    static findIn(name, folder, instance = "One") {

        // run and retunr array es.exe -instance "One" "D:\" -regex "^cursor.com$" -hide-empty-search-results -sort-descending -sort date-modified -whole-words -case -highlight -no-digit-grouping /ad

        // Create the command
        const command = `es.exe -instance "${instance}" "${folder}" -regex "^${name}$" -hide-empty-search-results -sort-descending -sort date-modified -whole-words -case -highlight -no-digit-grouping /ad`;

        return this.execute(command)

    }

    static execute(command) {

        try {
            // Execute the command and get the output
            let data = execSync(command, { encoding: 'utf-8' });
            //  console.log('data One: ', data)

            data = data.split("\r\n").filter(line => line.trim() !== '');
            //   console.log('data Two: ', data)

            // replace \\ to \
            data = data.map(line => line.replace(/\\\\/g, '\\'))
            //    data.forEach(line => console.log('Line: ', line));

            // console.log('data Three: ', data)\r
            return data

        } catch (error) {
            console.error('Error executing command:', error);
            return [];
        }

    }

}